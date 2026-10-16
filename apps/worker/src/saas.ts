import { z } from 'zod';

const TIMEOUT_MS = 5000;

/** Client RevenueCat d'un compte supprimé (ADR-012) : identifiant client = identifiant de profil. */
export interface SubscriptionCustomers {
  /** Sans effet si le client n'existe pas (jamais abonné, ou déjà supprimé). */
  delete(customerId: string): Promise<void>;
}

/** Personne PostHog d'un compte supprimé (ADR-013) : `distinct_id` = identifiant de profil. */
export interface AnalyticsPersons {
  /** Supprime la personne et ses événements ; sans effet si elle n'existe pas. */
  delete(distinctId: string): Promise<void>;
}

async function send(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // 404 : déjà supprimé, appel rejoué (idempotence).
  if (!response.ok && response.status !== 404) {
    throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} : HTTP ${response.status}`);
  }
  return response;
}

/** REST API v2 de RevenueCat (`DELETE /projects/{project_id}/customers/{customer_id}`, vérifié en T1). */
export class RevenueCatCustomers implements SubscriptionCustomers {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly options: {
      secretKey: string;
      projectId: string;
      baseUrl?: string;
      fetch?: typeof fetch;
    },
  ) {
    this.baseUrl = options.baseUrl ?? 'https://api.revenuecat.com/v2';
    this.fetchImpl = options.fetch ?? fetch;
  }

  async delete(customerId: string): Promise<void> {
    const url =
      `${this.baseUrl}/projects/${encodeURIComponent(this.options.projectId)}` +
      `/customers/${encodeURIComponent(customerId)}`;
    await send(this.fetchImpl, url, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${this.options.secretKey}` },
    });
  }
}

const personList = z.object({ results: z.array(z.object({ id: z.string() })) });

/**
 * API privée de PostHog, clé personnelle : recherche de la personne par `distinct_id`, puis
 * `DELETE /api/projects/{project_id}/persons/{uuid}/?delete_events=true` (traitement asynchrone).
 */
export class PostHogPersons implements AnalyticsPersons {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly options: {
      personalApiKey: string;
      projectId: string;
      host: string;
      fetch?: typeof fetch;
    },
  ) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async delete(distinctId: string): Promise<void> {
    const persons = `${this.options.host}/api/projects/${encodeURIComponent(this.options.projectId)}/persons`;
    const headers = { authorization: `Bearer ${this.options.personalApiKey}` };
    const response = await send(
      this.fetchImpl,
      `${persons}/?distinct_id=${encodeURIComponent(distinctId)}`,
      { headers },
    );
    if (response.status === 404) return;
    const { results } = personList.parse(await response.json());
    for (const person of results) {
      await send(
        this.fetchImpl,
        `${persons}/${encodeURIComponent(person.id)}/?delete_events=true`,
        { method: 'DELETE', headers },
      );
    }
  }
}

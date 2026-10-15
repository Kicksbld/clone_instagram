import { z } from 'zod';

import {
  type ProviderSubscription,
  type SubscriptionProvider,
  SubscriptionProviderUnavailableError,
} from '../../application/ports/subscription-provider.ts';

/** Entitlement RevenueCat qui donne Clone Plus (configuré en T1). */
export const PLUS_ENTITLEMENT = 'plus';
const TIMEOUT_MS = 5000;

// Champs lus de `GET /v2/projects/{project_id}/customers/{customer_id}/subscriptions` ; dates en ms.
const subscriptionList = z.object({
  items: z.array(
    z.object({
      product_id: z.string().nullable(),
      gives_access: z.boolean(),
      current_period_ends_at: z.number().nullable(),
      ends_at: z.number().nullable(),
      entitlements: z.object({
        items: z.array(
          z.object({
            lookup_key: z.string(),
            products: z
              .object({
                items: z.array(z.object({ id: z.string(), store_identifier: z.string() })),
              })
              .optional(),
          }),
        ),
      }),
    }),
  ),
});
type RevenueCatSubscription = z.infer<typeof subscriptionList>['items'][number];

export interface RevenueCatOptions {
  secretKey: string;
  projectId: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Fin d'accès : la plus tardive des deux dates (`ends_at` diffère après un renouvellement anticipé). */
function endOf(subscription: RevenueCatSubscription): number | null {
  const dates = [subscription.current_period_ends_at, subscription.ends_at].filter(
    (date): date is number => date !== null,
  );
  return dates.length > 0 ? Math.max(...dates) : null;
}

/** Identifiant store du produit (`…plus.monthly`), sinon l'identifiant RevenueCat. */
function storeProductId(subscription: RevenueCatSubscription): string {
  const products = subscription.entitlements.items.flatMap((e) => e.products?.items ?? []);
  const product = products.find((p) => p.id === subscription.product_id);
  return product?.store_identifier ?? subscription.product_id ?? 'unknown';
}

/**
 * Adapter `fetch` de la REST API v2 de RevenueCat (ADR-012), sans SDK serveur. Parmi les abonnements
 * du client qui donnent l'entitlement `plus`, retient celui qui donne accès (sinon le plus récent).
 */
export class RevenueCatSubscriptionProvider implements SubscriptionProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: RevenueCatOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.revenuecat.com/v2';
    this.fetchImpl = options.fetch ?? fetch;
  }

  async fetch(customerId: string): Promise<ProviderSubscription | null> {
    const url =
      `${this.baseUrl}/projects/${encodeURIComponent(this.options.projectId)}` +
      `/customers/${encodeURIComponent(customerId)}/subscriptions?limit=100`;
    let body: unknown;
    try {
      const response = await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${this.options.secretKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Client inconnu de RevenueCat : jamais abonné (le SDK ne l'a pas encore créé).
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`RevenueCat a répondu ${response.status}`);
      body = await response.json();
    } catch (error) {
      throw new SubscriptionProviderUnavailableError(error);
    }

    const parsed = subscriptionList.safeParse(body);
    if (!parsed.success) throw new SubscriptionProviderUnavailableError(parsed.error);

    const plus = parsed.data.items.filter((s) =>
      s.entitlements.items.some((e) => e.lookup_key === PLUS_ENTITLEMENT),
    );
    if (plus.length === 0) return null;
    const latest = (items: RevenueCatSubscription[]) =>
      items.reduce((a, b) => ((endOf(b) ?? 0) > (endOf(a) ?? 0) ? b : a));
    const active = plus.filter((s) => s.gives_access);
    const chosen = latest(active.length > 0 ? active : plus);
    const end = endOf(chosen);
    return {
      status: chosen.gives_access ? 'active' : 'expired',
      productId: storeProductId(chosen),
      expiresAt: end === null ? null : new Date(end),
    };
  }
}

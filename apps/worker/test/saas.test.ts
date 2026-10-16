import { describe, expect, it } from 'vitest';

import { PostHogPersons, RevenueCatCustomers } from '../src/saas.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';

type Respond = (url: string, init?: RequestInit) => Response;

function recorder(respond: Respond) {
  const calls: { url: string; method: string; authorization: string | undefined }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      authorization: headers.get('authorization') ?? undefined,
    });
    return Promise.resolve(respond(url, init));
  };
  return { calls, fetchImpl };
}

describe('RevenueCatCustomers', () => {
  const customers = (respond: Respond) => {
    const { calls, fetchImpl } = recorder(respond);
    return {
      calls,
      instance: new RevenueCatCustomers({
        secretKey: 'sk_test',
        projectId: 'proj1',
        fetch: fetchImpl,
      }),
    };
  };

  it('supprime le client par la REST API v2', async () => {
    const { instance, calls } = customers(() => new Response('{}', { status: 200 }));

    await instance.delete(ME);

    expect(calls).toEqual([
      {
        url: `https://api.revenuecat.com/v2/projects/proj1/customers/${ME}`,
        method: 'DELETE',
        authorization: 'Bearer sk_test',
      },
    ]);
  });

  it('client inconnu (404) → succès', async () => {
    const { instance } = customers(() => new Response('{}', { status: 404 }));

    await expect(instance.delete(ME)).resolves.toBeUndefined();
  });

  it('erreur serveur → échec (job rejoué)', async () => {
    const { instance } = customers(() => new Response('{}', { status: 503 }));

    await expect(instance.delete(ME)).rejects.toThrow('HTTP 503');
  });
});

describe('PostHogPersons', () => {
  const persons = (respond: Respond) => {
    const { calls, fetchImpl } = recorder(respond);
    return {
      calls,
      instance: new PostHogPersons({
        personalApiKey: 'phx_test',
        projectId: '42',
        host: 'https://eu.posthog.com',
        fetch: fetchImpl,
      }),
    };
  };

  it('cherche la personne par distinct_id, puis la supprime avec ses événements', async () => {
    const { instance, calls } = persons((_url, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ results: [{ id: 'person-uuid' }] }),
    );

    await instance.delete(ME);

    expect(calls).toEqual([
      {
        url: `https://eu.posthog.com/api/projects/42/persons/?distinct_id=${ME}`,
        method: 'GET',
        authorization: 'Bearer phx_test',
      },
      {
        url: 'https://eu.posthog.com/api/projects/42/persons/person-uuid/?delete_events=true',
        method: 'DELETE',
        authorization: 'Bearer phx_test',
      },
    ]);
  });

  it('personne inconnue → aucune suppression, succès', async () => {
    const { instance, calls } = persons(() => Response.json({ results: [] }));

    await instance.delete(ME);

    expect(calls).toHaveLength(1);
  });

  it('PostHog injoignable → échec (job rejoué)', async () => {
    const { instance } = persons(() => new Response(null, { status: 502 }));

    await expect(instance.delete(ME)).rejects.toThrow('HTTP 502');
  });
});

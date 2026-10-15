import { describe, expect, it } from 'vitest';

import { SubscriptionProviderUnavailableError } from '../../../src/modules/billing/application/ports/subscription-provider.ts';
import { RevenueCatSubscriptionProvider } from '../../../src/modules/billing/infrastructure/revenuecat/revenuecat-subscription-provider.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const STORE_ID = 'com.killianboularand.cloneinstagram.plus.monthly';
const END = Date.parse('2026-10-25T12:00:00.000Z');

/** Abonnement au format de la REST API v2 (champs lus par l'adapter). */
function rcSubscription(overrides: Record<string, unknown> = {}, lookupKey = 'plus') {
  return {
    object: 'subscription',
    id: 'sub1',
    product_id: 'prod1',
    gives_access: true,
    status: 'active',
    current_period_ends_at: END,
    ends_at: null,
    entitlements: {
      object: 'list',
      items: [
        {
          id: 'entl1',
          lookup_key: lookupKey,
          products: { items: [{ id: 'prod1', store_identifier: STORE_ID }] },
        },
      ],
    },
    ...overrides,
  };
}

function provider(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const instance = new RevenueCatSubscriptionProvider({
    secretKey: 'sk_test',
    projectId: 'proj1',
    fetch: (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push({ url, init });
      return Promise.resolve(respond(url, init));
    },
  });
  return { instance, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('RevenueCatSubscriptionProvider', () => {
  it('appelle la REST API v2 avec la clé secrète', async () => {
    const { instance, calls } = provider(() => json({ items: [] }));
    await instance.fetch(ME);

    expect(calls[0]?.url).toBe(
      `https://api.revenuecat.com/v2/projects/proj1/customers/${ME}/subscriptions?limit=100`,
    );
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer sk_test');
  });

  it('abonnement qui donne accès → actif, identifiant store, fin de période', async () => {
    const { instance } = provider(() => json({ items: [rcSubscription()] }));
    await expect(instance.fetch(ME)).resolves.toEqual({
      status: 'active',
      productId: STORE_ID,
      expiresAt: new Date(END),
    });
  });

  it('retient la date de fin la plus tardive (renouvellement anticipé)', async () => {
    const later = END + 30 * 24 * 60 * 60 * 1000;
    const { instance } = provider(() => json({ items: [rcSubscription({ ends_at: later })] }));
    await expect(instance.fetch(ME)).resolves.toMatchObject({ expiresAt: new Date(later) });
  });

  it('préfère l’abonnement qui donne accès à un ancien abonnement expiré', async () => {
    const expired = rcSubscription({ gives_access: false, current_period_ends_at: END - 1000 });
    const { instance } = provider(() => json({ items: [expired, rcSubscription()] }));
    await expect(instance.fetch(ME)).resolves.toMatchObject({ status: 'active' });
  });

  it('seulement des abonnements terminés → expiré', async () => {
    const { instance } = provider(() =>
      json({ items: [rcSubscription({ gives_access: false, status: 'expired' })] }),
    );
    await expect(instance.fetch(ME)).resolves.toMatchObject({ status: 'expired' });
  });

  it('aucun abonnement Plus → null', async () => {
    const { instance } = provider(() => json({ items: [rcSubscription({}, 'autre')] }));
    await expect(instance.fetch(ME)).resolves.toBeNull();
  });

  it('client inconnu (404) → null', async () => {
    const { instance } = provider(() => json({ type: 'resource_missing' }, 404));
    await expect(instance.fetch(ME)).resolves.toBeNull();
  });

  it.each([
    ['erreur 5xx', () => json({ type: 'server_error' }, 503)],
    ['clé refusée (401)', () => json({ type: 'authentication_error' }, 401)],
    ['réponse illisible', () => json({ items: 'oups' })],
    ['réseau coupé', () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s → injoignable', async (_label, respond) => {
    const { instance } = provider(respond);
    await expect(instance.fetch(ME)).rejects.toBeInstanceOf(SubscriptionProviderUnavailableError);
  });
});

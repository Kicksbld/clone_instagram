import { beforeEach, describe, expect, it } from 'vitest';

import { GetPlan } from '../../../src/modules/billing/application/use-cases/get-plan.ts';
import { RefreshSubscription } from '../../../src/modules/billing/application/use-cases/refresh-subscription.ts';
import {
  isPlus,
  planOf,
  PlusRequiredError,
  type Subscription,
} from '../../../src/modules/billing/domain/subscription.ts';
import { ProfileNotFoundError } from '../../../src/modules/identity/domain/errors.ts';
import { InMemoryAnalyticsTracker } from '../../support/fakes.ts';
import {
  InMemorySubscriptionProvider,
  InMemorySubscriptions,
} from '../../support/in-memory-billing.ts';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const ME = '0199a1b2-0000-7000-8000-000000000001';
const PRODUCT = 'com.killianboularand.cloneinstagram.plus.monthly';
const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000);

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  userId: ME,
  status: 'active',
  productId: PRODUCT,
  expiresAt: minutes(60 * 24 * 30),
  refreshedAt: minutes(-60),
  ...overrides,
});

describe('isPlus', () => {
  it('actif avec une période en cours → plus', () => {
    expect(isPlus(subscription(), NOW)).toBe(true);
  });

  it.each([
    ['sans abonnement', null],
    ['expiré chez RevenueCat', subscription({ status: 'expired' })],
    ['période terminée', subscription({ expiresAt: minutes(-1) })],
    ['fin pile maintenant', subscription({ expiresAt: NOW })],
    ['sans date de fin', subscription({ expiresAt: null })],
  ])('%s → free', (_label, value) => {
    expect(isPlus(value, NOW)).toBe(false);
    expect(planOf(value, NOW)).toEqual({ plan: 'free', expiresAt: null });
  });

  it('plus_required est un 403', () => {
    expect(new PlusRequiredError()).toMatchObject({ kind: 'forbidden', code: 'plus_required' });
  });
});

describe('GetPlan', () => {
  it('lit l’abonnement enregistré sans appeler RevenueCat', async () => {
    const subscriptions = new InMemorySubscriptions();
    await subscriptions.save(subscription());
    await expect(
      new GetPlan(subscriptions, { now: () => NOW }).execute({ userId: ME }),
    ).resolves.toEqual({ plan: 'plus', expiresAt: subscription().expiresAt });
  });
});

describe('RefreshSubscription', () => {
  let accounts: Set<string>;
  let subscriptions: InMemorySubscriptions;
  let provider: InMemorySubscriptionProvider;
  let analytics: InMemoryAnalyticsTracker;
  let refresh: RefreshSubscription;

  beforeEach(() => {
    accounts = new Set([ME]);
    analytics = new InMemoryAnalyticsTracker();
    subscriptions = new InMemorySubscriptions();
    provider = new InMemorySubscriptionProvider();
    refresh = new RefreshSubscription(
      {
        findById: (id) =>
          Promise.resolve(
            accounts.has(id)
              ? { id, status: 'active' as const, isPrivate: false, followerCount: 0 }
              : null,
          ),
      },
      subscriptions,
      provider,
      { now: () => NOW },
      analytics,
    );
  });

  it('achat chez RevenueCat → plus, copie locale enregistrée', async () => {
    const expiresAt = minutes(60 * 24 * 30);
    provider.customers.set(ME, { status: 'active', productId: PRODUCT, expiresAt });

    await expect(refresh.execute({ userId: ME })).resolves.toEqual({
      plan: 'plus',
      expiresAt,
      providerUnavailable: false,
    });
    expect(subscriptions.rows.get(ME)).toEqual({
      userId: ME,
      status: 'active',
      productId: PRODUCT,
      expiresAt,
      refreshedAt: NOW,
    });
  });

  it('jamais abonné (restauration sans achat) → free, aucune ligne', async () => {
    await expect(refresh.execute({ userId: ME })).resolves.toMatchObject({ plan: 'free' });
    expect(subscriptions.rows.size).toBe(0);
  });

  it('abonnement expiré → free, statut enregistré', async () => {
    await subscriptions.save(subscription());
    provider.customers.set(ME, { status: 'expired', productId: PRODUCT, expiresAt: minutes(-5) });

    await expect(refresh.execute({ userId: ME })).resolves.toMatchObject({ plan: 'free' });
    expect(subscriptions.rows.get(ME)).toMatchObject({ status: 'expired', refreshedAt: NOW });
  });

  it('abonné Plus relu il y a moins de 5 min → pas d’appel à RevenueCat', async () => {
    await subscriptions.save(subscription({ refreshedAt: minutes(-4) }));

    await expect(refresh.execute({ userId: ME })).resolves.toMatchObject({ plan: 'plus' });
    expect(provider.calls).toBe(0);
  });

  it('abonné Plus relu il y a 5 min ou plus → RevenueCat rappelé', async () => {
    await subscriptions.save(subscription({ refreshedAt: minutes(-5) }));
    provider.customers.set(ME, { status: 'expired', productId: PRODUCT, expiresAt: minutes(-1) });

    await expect(refresh.execute({ userId: ME })).resolves.toMatchObject({ plan: 'free' });
    expect(provider.calls).toBe(1);
  });

  it('compte free relu il y a moins de 5 min → RevenueCat rappelé (achat récent)', async () => {
    await subscriptions.save(subscription({ status: 'expired', refreshedAt: minutes(-1) }));
    const expiresAt = minutes(60 * 24 * 30);
    provider.customers.set(ME, { status: 'active', productId: PRODUCT, expiresAt });

    await expect(refresh.execute({ userId: ME })).resolves.toMatchObject({ plan: 'plus' });
    expect(provider.calls).toBe(1);
  });

  it('RevenueCat injoignable → dernier statut connu conservé', async () => {
    const stored = subscription({ refreshedAt: minutes(-30) });
    await subscriptions.save(stored);
    provider.unavailable = true;

    await expect(refresh.execute({ userId: ME })).resolves.toEqual({
      plan: 'plus',
      expiresAt: stored.expiresAt,
      providerUnavailable: true,
    });
    expect(subscriptions.rows.get(ME)).toEqual(stored);
  });

  it('RevenueCat injoignable sans statut connu → free', async () => {
    provider.unavailable = true;
    await expect(refresh.execute({ userId: ME })).resolves.toMatchObject({
      plan: 'free',
      providerUnavailable: true,
    });
  });

  describe('subscription_activated (ADR-013)', () => {
    const activated = {
      distinctId: ME,
      event: { name: 'subscription_activated', properties: { product_id: PRODUCT } },
    };
    const active = () => ({
      status: 'active' as const,
      productId: PRODUCT,
      expiresAt: minutes(60 * 24 * 30),
    });

    it('jamais abonné → plus : envoyé une fois', async () => {
      provider.customers.set(ME, active());

      await refresh.execute({ userId: ME });

      expect(analytics.events).toEqual([activated]);
    });

    it('expiré → plus : envoyé', async () => {
      await subscriptions.save(subscription({ status: 'expired', expiresAt: minutes(-60) }));
      provider.customers.set(ME, active());

      await refresh.execute({ userId: ME });

      expect(analytics.events).toEqual([activated]);
    });

    it('déjà plus, relu chez RevenueCat (renouvellement) → rien', async () => {
      await subscriptions.save(subscription({ refreshedAt: minutes(-30) }));
      provider.customers.set(ME, active());

      await refresh.execute({ userId: ME });

      expect(provider.calls).toBe(1);
      expect(analytics.events).toEqual([]);
    });

    it.each([
      [
        'abonné relu il y a moins de 5 min',
        () => subscriptions.save(subscription({ refreshedAt: minutes(-1) })),
      ],
      ['jamais abonné', () => Promise.resolve()],
      [
        'RevenueCat injoignable',
        () => {
          provider.unavailable = true;
          return Promise.resolve();
        },
      ],
    ])('%s → rien', async (_case, given) => {
      await given();

      await refresh.execute({ userId: ME });

      expect(analytics.events).toEqual([]);
    });
  });

  it('profil absent → profile_not_found, sans appel à RevenueCat', async () => {
    accounts.clear();
    await expect(refresh.execute({ userId: ME })).rejects.toBeInstanceOf(ProfileNotFoundError);
    expect(provider.calls).toBe(0);
  });
});

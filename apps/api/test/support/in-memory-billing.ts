import {
  type ProviderSubscription,
  type SubscriptionProvider,
  SubscriptionProviderUnavailableError,
} from '../../src/modules/billing/application/ports/subscription-provider.ts';
import type { SubscriptionRepository } from '../../src/modules/billing/application/ports/subscription-repository.ts';
import type { Subscription } from '../../src/modules/billing/domain/subscription.ts';

/** Table `subscriptions` en mémoire. */
export class InMemorySubscriptions implements SubscriptionRepository {
  readonly rows = new Map<string, Subscription>();

  find(userId: string): Promise<Subscription | null> {
    return Promise.resolve(this.rows.get(userId) ?? null);
  }

  save(subscription: Subscription): Promise<void> {
    this.rows.set(subscription.userId, { ...subscription });
    return Promise.resolve();
  }
}

/** RevenueCat en mémoire (ADR-012) : aucun appel réel ; compte les lectures. */
export class InMemorySubscriptionProvider implements SubscriptionProvider {
  readonly customers = new Map<string, ProviderSubscription>();
  unavailable = false;
  calls = 0;

  fetch(customerId: string): Promise<ProviderSubscription | null> {
    this.calls += 1;
    if (this.unavailable) return Promise.reject(new SubscriptionProviderUnavailableError());
    return Promise.resolve(this.customers.get(customerId) ?? null);
  }
}

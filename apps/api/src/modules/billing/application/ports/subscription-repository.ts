import type { Subscription } from '../../domain/subscription.ts';

/** Table `subscriptions`, écrite uniquement par `RefreshSubscription` (ADR-012). */
export interface SubscriptionRepository {
  find(userId: string): Promise<Subscription | null>;
  save(subscription: Subscription): Promise<void>;
}

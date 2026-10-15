import { subscriptions, type Executor } from '@clone/db';
import { eq } from 'drizzle-orm';

import type { SubscriptionRepository } from '../../application/ports/subscription-repository.ts';
import type { Subscription } from '../../domain/subscription.ts';

/** Copie locale de l'abonnement Clone Plus (table `subscriptions`, ADR-012). */
export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Executor) {}

  async find(userId: string): Promise<Subscription | null> {
    const [row] = await this.db
      .select({
        userId: subscriptions.userId,
        status: subscriptions.status,
        productId: subscriptions.productId,
        expiresAt: subscriptions.expiresAt,
        refreshedAt: subscriptions.refreshedAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async save(subscription: Subscription): Promise<void> {
    const values = {
      status: subscription.status,
      productId: subscription.productId,
      expiresAt: subscription.expiresAt,
      refreshedAt: subscription.refreshedAt,
      updatedAt: subscription.refreshedAt,
    };
    await this.db
      .insert(subscriptions)
      .values({ userId: subscription.userId, ...values })
      .onConflictDoUpdate({ target: subscriptions.userId, set: values });
  }
}

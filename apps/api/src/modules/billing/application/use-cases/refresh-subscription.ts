import type { Clock } from '../../../../shared/application/clock.ts';
import { ProfileNotFoundError } from '../../../identity/domain/errors.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import { isFresh, planOf, type PlanStatus } from '../../domain/subscription.ts';
import {
  type SubscriptionProvider,
  SubscriptionProviderUnavailableError,
} from '../ports/subscription-provider.ts';
import type { SubscriptionRepository } from '../ports/subscription-repository.ts';

export interface RefreshResult extends PlanStatus {
  /** RevenueCat injoignable : dernier statut connu renvoyé (journalisé par la route). */
  providerUnavailable: boolean;
}

/**
 * Relit l'abonnement chez RevenueCat et met à jour la copie locale (ADR-012). Un abonné Plus relu
 * il y a moins de 5 minutes n'est pas relu ; un compte `free` l'est toujours, pour voir un achat
 * récent. RevenueCat injoignable : dernier statut connu conservé.
 */
export class RefreshSubscription {
  constructor(
    private readonly accounts: AccountReader,
    private readonly subscriptions: SubscriptionRepository,
    private readonly provider: SubscriptionProvider,
    private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string }): Promise<RefreshResult> {
    if (!(await this.accounts.findById(input.userId))) throw new ProfileNotFoundError();
    const stored = await this.subscriptions.find(input.userId);
    const now = this.clock.now();
    if (isFresh(stored, now)) return { ...planOf(stored, now), providerUnavailable: false };

    let fetched;
    try {
      fetched = await this.provider.fetch(input.userId);
    } catch (error) {
      if (!(error instanceof SubscriptionProviderUnavailableError)) throw error;
      return { ...planOf(stored, now), providerUnavailable: true };
    }
    // Jamais abonné : pas de ligne. Une ligne existante reste (RevenueCat ne l'oublie pas).
    if (!fetched) return { ...planOf(stored, now), providerUnavailable: false };

    const subscription = { userId: input.userId, ...fetched, refreshedAt: now };
    await this.subscriptions.save(subscription);
    return { ...planOf(subscription, now), providerUnavailable: false };
  }
}

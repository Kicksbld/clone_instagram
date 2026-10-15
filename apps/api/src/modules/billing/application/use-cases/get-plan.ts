import type { Clock } from '../../../../shared/application/clock.ts';
import { planOf, type PlanStatus } from '../../domain/subscription.ts';
import type { SubscriptionRepository } from '../ports/subscription-repository.ts';

/** Mon plan selon l'abonnement enregistré, sans appel à RevenueCat (champs `plan` de `GET /me`). */
export class GetPlan {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string }): Promise<PlanStatus> {
    return planOf(await this.subscriptions.find(input.userId), this.clock.now());
  }
}

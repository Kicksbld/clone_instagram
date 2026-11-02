import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotFollowSelfError } from '../../domain/errors.ts';
import type { FollowStatus } from '../../domain/user-summary.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Ne plus suivre un compte visible, public ou privé, ou annuler sa demande d'abonnement en attente
 * (T20) ; la notification correspondante est retirée (ADR-026). Idempotent : les compteurs ne
 * changent que si l'abonnement est supprimé (ADR-005).
 */
export class UnfollowUser {
  constructor(private readonly transaction: UnitOfWork<FollowTransaction>) {}

  execute(input: { viewerId: string; userId: string }): Promise<FollowStatus> {
    const { viewerId, userId } = input;
    if (viewerId === userId) return Promise.reject(new CannotFollowSelfError());

    return this.transaction.run(
      async ({ accounts, relationships, follows, requests, counters, notifications }) => {
        const target = await accounts.findById(userId);
        if (!target) throw new UserNotFoundError();
        const relation = await relationships.between(viewerId, target.id);
        if (!canViewProfile(viewerId, target, relation)) throw new UserNotFoundError();

        const none = { following: false, requested: false };
        if (await requests.remove(viewerId, target.id)) {
          await notifications.retract({
            recipientId: target.id,
            actorId: viewerId,
            type: 'follow_request',
          });
        }
        if (!(await follows.remove(viewerId, target.id))) {
          return { ...none, followerCount: target.followerCount };
        }
        await notifications.retract({ recipientId: target.id, actorId: viewerId, type: 'follow' });
        return { ...none, followerCount: await counters.apply(viewerId, target.id, -1) };
      },
    );
  }
}

import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotFollowSelfError } from '../../domain/errors.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Retirer `userId` de mes abonnés (ADR-006) : son abonnement est supprimé, compteurs compris, avec sa
 * notification `follow` (ADR-026) ; il n'est pas prévenu. Idempotent : un compte qui ne me suit pas ne
 * change rien. Compte inexistant ou invisible : `user_not_found`.
 */
export class RemoveFollower {
  constructor(private readonly transaction: UnitOfWork<FollowTransaction>) {}

  execute(input: { viewerId: string; userId: string }): Promise<void> {
    const { viewerId, userId } = input;
    if (viewerId === userId) return Promise.reject(new CannotFollowSelfError());

    return this.transaction.run(
      async ({ accounts, relationships, follows, counters, notifications }) => {
        const follower = await accounts.findById(userId);
        if (!follower) throw new UserNotFoundError();
        const relation = await relationships.between(viewerId, follower.id);
        if (!canViewProfile(viewerId, follower, relation)) throw new UserNotFoundError();

        if (!(await follows.remove(follower.id, viewerId))) return;
        await counters.apply(follower.id, viewerId, -1);
        await notifications.retract({
          recipientId: viewerId,
          actorId: follower.id,
          type: 'follow',
        });
      },
    );
  }
}

import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotFollowSelfError } from '../../domain/errors.ts';
import type { FollowStatus } from '../../domain/user-summary.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Ne plus suivre un compte visible, public ou privé. Idempotent : les compteurs ne changent que si
 * l'abonnement est supprimé (ADR-005).
 */
export class UnfollowUser {
  constructor(private readonly transaction: UnitOfWork<FollowTransaction>) {}

  execute(input: { viewerId: string; userId: string }): Promise<FollowStatus> {
    const { viewerId, userId } = input;
    if (viewerId === userId) return Promise.reject(new CannotFollowSelfError());

    return this.transaction.run(async ({ accounts, relationships, follows, counters }) => {
      const target = await accounts.findById(userId);
      if (!target) throw new UserNotFoundError();
      const relation = await relationships.between(viewerId, target.id);
      if (!canViewProfile(viewerId, target, relation)) throw new UserNotFoundError();

      const removed = await follows.remove(viewerId, target.id);
      const followerCount = removed
        ? await counters.apply(viewerId, target.id, -1)
        : target.followerCount;
      return { following: false, followerCount };
    });
  }
}

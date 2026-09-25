import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { ProfileNotFoundError, UserNotFoundError } from '../../../identity/domain/errors.ts';
import { AccountPrivateError, CannotFollowSelfError } from '../../domain/errors.ts';
import type { FollowStatus } from '../../domain/user-summary.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Suivre un compte (ADR-006) : visible, pas soi-même, public ou déjà suivi (compte privé refusé en
 * P0, D32). Idempotent : les compteurs ne changent que si l'abonnement est créé (ADR-005).
 */
export class FollowUser {
  constructor(private readonly transaction: UnitOfWork<FollowTransaction>) {}

  execute(input: { viewerId: string; userId: string }): Promise<FollowStatus> {
    const { viewerId, userId } = input;
    if (viewerId === userId) return Promise.reject(new CannotFollowSelfError());

    return this.transaction.run(async ({ accounts, relationships, follows, counters }) => {
      if (!(await accounts.findById(viewerId))) throw new ProfileNotFoundError();
      const target = await accounts.findById(userId);
      if (!target) throw new UserNotFoundError();
      const relation = await relationships.between(viewerId, target.id);
      if (!canViewProfile(viewerId, target, relation)) throw new UserNotFoundError();

      if (relation.viewerFollowsOwner) {
        return { following: true, followerCount: target.followerCount };
      }
      if (target.isPrivate) throw new AccountPrivateError();

      const created = await follows.add(viewerId, target.id);
      const followerCount = created
        ? await counters.apply(viewerId, target.id, 1)
        : target.followerCount;
      return { following: true, followerCount };
    });
  }
}

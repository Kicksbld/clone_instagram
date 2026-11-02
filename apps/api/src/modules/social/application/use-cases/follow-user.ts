import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { ProfileNotFoundError, UserNotFoundError } from '../../../identity/domain/errors.ts';
import { AccountPrivateError, CannotFollowSelfError } from '../../domain/errors.ts';
import type { FollowStatus } from '../../domain/user-summary.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Suivre un compte (ADR-006) : visible, pas soi-même, public ou déjà suivi (compte privé refusé en
 * P0, D32). Idempotent : les compteurs ne changent que si l'abonnement est créé (ADR-005). Le compte
 * suivi est notifié dans la même transaction (ADR-026), la notification diffusée après elle.
 */
export class FollowUser {
  constructor(
    private readonly transaction: UnitOfWork<FollowTransaction>,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: { viewerId: string; userId: string }): Promise<FollowStatus> {
    const { viewerId, userId } = input;
    if (viewerId === userId) throw new CannotFollowSelfError();

    const { status, notification } = await this.transaction.run(async (scope) => {
      const { accounts, relationships, follows, counters } = scope;
      if (!(await accounts.findById(viewerId))) throw new ProfileNotFoundError();
      const target = await accounts.findById(userId);
      if (!target) throw new UserNotFoundError();
      const relation = await relationships.between(viewerId, target.id);
      if (!canViewProfile(viewerId, target, relation)) throw new UserNotFoundError();

      const unchanged = {
        status: { following: true, followerCount: target.followerCount },
        notification: null,
      };
      if (relation.viewerFollowsOwner) return unchanged;
      if (target.isPrivate) throw new AccountPrivateError();

      if (!(await follows.add(viewerId, target.id))) return unchanged;
      const followerCount = await counters.apply(viewerId, target.id, 1);
      const notification = await scope.notifications.notify({
        recipientId: target.id,
        actorId: viewerId,
        type: 'follow',
      });
      return { status: { following: true, followerCount }, notification };
    });
    if (notification) this.notifications.dispatch([notification]);
    return status;
  }
}

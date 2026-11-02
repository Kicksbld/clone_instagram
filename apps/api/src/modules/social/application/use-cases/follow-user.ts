import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { CreatedNotification } from '../../../../shared/domain/notification.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { ProfileNotFoundError, UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotFollowSelfError } from '../../domain/errors.ts';
import type { FollowStatus } from '../../domain/user-summary.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Suivre un compte visible, pas soi-même (ADR-006) : compte public, abonnement direct ; compte privé
 * non suivi, demande d'abonnement (T20), sans accès à ses contenus. Idempotent : les compteurs ne
 * changent que si l'abonnement est créé (ADR-005), une demande déjà faite ne change rien. Le compte
 * visé est notifié dans la même transaction (`follow` ou `follow_request`, ADR-026), la notification
 * diffusée après elle.
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
      const { accounts, relationships, follows, requests, counters } = scope;
      if (!(await accounts.findById(viewerId))) throw new ProfileNotFoundError();
      const target = await accounts.findById(userId);
      if (!target) throw new UserNotFoundError();
      const relation = await relationships.between(viewerId, target.id);
      if (!canViewProfile(viewerId, target, relation)) throw new UserNotFoundError();

      const result = (
        status: Omit<FollowStatus, 'followerCount'>,
        notification: CreatedNotification | null = null,
        followerCount = target.followerCount,
      ) => ({ status: { ...status, followerCount }, notification });

      if (relation.viewerFollowsOwner) return result({ following: true, requested: false });

      if (target.isPrivate) {
        const requested = { following: false, requested: true };
        if (!(await requests.add(viewerId, target.id))) return result(requested);
        const notification = await scope.notifications.notify({
          recipientId: target.id,
          actorId: viewerId,
          type: 'follow_request',
        });
        return result(requested, notification);
      }

      const following = { following: true, requested: false };
      if (!(await follows.add(viewerId, target.id))) return result(following);
      const followerCount = await counters.apply(viewerId, target.id, 1);
      const notification = await scope.notifications.notify({
        recipientId: target.id,
        actorId: viewerId,
        type: 'follow',
      });
      return result(following, notification, followerCount);
    });
    if (notification) this.notifications.dispatch([notification]);
    return status;
  }
}

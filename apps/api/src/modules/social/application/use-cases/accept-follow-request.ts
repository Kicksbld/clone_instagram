import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { FollowRequestNotFoundError } from '../../domain/errors.ts';
import { acceptRemovedRequest } from '../follow-request-acceptance.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Accepter la demande d'abonnement de `requesterId` (ADR-006) : il devient mon abonné, compteurs
 * compris, et la demande est supprimée, dans une transaction ; notifications `follow` (à moi) et
 * `follow_accepted` (au demandeur) diffusées après elle (ADR-026). Demande inexistante (annulée
 * entre-temps, déjà traitée) ou demandeur invisible : `follow_request_not_found`.
 */
export class AcceptFollowRequest {
  constructor(
    private readonly transaction: UnitOfWork<FollowTransaction>,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: { viewerId: string; requesterId: string }): Promise<void> {
    const { viewerId, requesterId } = input;
    const created = await this.transaction.run(async (scope) => {
      const requester = await scope.accounts.findById(requesterId);
      if (!requester) throw new FollowRequestNotFoundError();
      const relation = await scope.relationships.between(viewerId, requester.id);
      if (!canViewProfile(viewerId, requester, relation)) throw new FollowRequestNotFoundError();
      if (!(await scope.requests.remove(requester.id, viewerId))) {
        throw new FollowRequestNotFoundError();
      }
      return acceptRemovedRequest(scope, requester.id, viewerId);
    });
    if (created.length > 0) this.notifications.dispatch(created);
  }
}

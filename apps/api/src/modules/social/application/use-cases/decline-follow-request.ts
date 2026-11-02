import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { FollowRequestNotFoundError } from '../../domain/errors.ts';
import type { FollowTransaction } from '../ports/follow-transaction.ts';

/**
 * Refuser la demande d'abonnement de `requesterId` : elle est supprimée avec sa notification, sans
 * prévenir le demandeur (ADR-006). Demande inexistante (annulée entre-temps, déjà traitée) :
 * `follow_request_not_found`.
 */
export class DeclineFollowRequest {
  constructor(private readonly transaction: UnitOfWork<FollowTransaction>) {}

  execute(input: { viewerId: string; requesterId: string }): Promise<void> {
    const { viewerId, requesterId } = input;
    return this.transaction.run(async ({ requests, notifications }) => {
      if (!(await requests.remove(requesterId, viewerId))) throw new FollowRequestNotFoundError();
      await notifications.retract({
        recipientId: viewerId,
        actorId: requesterId,
        type: 'follow_request',
      });
    });
  }
}

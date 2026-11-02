import type { NotificationWriter } from '../../../shared/application/notification-writer.ts';
import type { CreatedNotification } from '../../../shared/domain/notification.ts';
import type { FollowCounters, FollowRepository } from './ports/follow-repository.ts';
import type { FollowRequestRepository } from './ports/follow-request-repository.ts';

/**
 * Repositories nécessaires pour accepter une demande d'abonnement, dans la transaction de l'action :
 * `AcceptFollowRequest`, et le passage en public de `UpdateSettings` (module `identity`).
 */
export interface FollowRequestAcceptance {
  follows: FollowRepository;
  requests: FollowRequestRepository;
  counters: FollowCounters;
  notifications: NotificationWriter;
}

/**
 * Le demandeur, dont la demande vient d'être supprimée, devient abonné de `targetId` (compteurs
 * compris). Notifications (ADR-026) : `follow_request` retirée, `follow` au compte qui accepte,
 * `follow_accepted` au demandeur (renouvelée si une ancienne acceptation existe, pour dater la
 * nouvelle). Renvoie les notifications créées, à diffuser après la transaction.
 */
export async function acceptRemovedRequest(
  { follows, counters, notifications }: FollowRequestAcceptance,
  requesterId: string,
  targetId: string,
): Promise<CreatedNotification[]> {
  await notifications.retract({
    recipientId: targetId,
    actorId: requesterId,
    type: 'follow_request',
  });
  if (await follows.add(requesterId, targetId)) {
    await counters.apply(requesterId, targetId, 1);
  }
  await notifications.retract({
    recipientId: requesterId,
    actorId: targetId,
    type: 'follow_accepted',
  });
  // Une requête à la fois : la transaction n'a qu'une connexion.
  const follow = await notifications.notify({
    recipientId: targetId,
    actorId: requesterId,
    type: 'follow',
  });
  const accepted = await notifications.notify({
    recipientId: requesterId,
    actorId: targetId,
    type: 'follow_accepted',
  });
  return [follow, accepted].filter((notification) => notification !== null);
}

/**
 * Passage en public : toutes les demandes reçues par `targetId` sont acceptées dans la transaction
 * (ADR-006), avec les mêmes notifications qu'une acceptation une par une.
 */
export async function acceptAllRequests(
  scope: FollowRequestAcceptance,
  targetId: string,
): Promise<CreatedNotification[]> {
  const created: CreatedNotification[] = [];
  for (const requesterId of await scope.requests.removeAllTo(targetId)) {
    created.push(...(await acceptRemovedRequest(scope, requesterId, targetId)));
  }
  return created;
}

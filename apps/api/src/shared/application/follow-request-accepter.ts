import type { CreatedNotification } from '../domain/notification.ts';

/**
 * Acceptation des demandes d'abonnement en attente (table `follow_requests` du module `social`, ADR-006,
 * ADR-032), écrite dans la transaction de l'action (`UnitOfWork`) : port transverse, sur le modèle de
 * `NotificationWriter`, pour le passage en public d'`UpdateSettings` (module `identity`).
 */
export interface FollowRequestAccepter {
  /**
   * Accepte toutes les demandes reçues par `targetId` (abonnements, compteurs, notifications) et
   * renvoie les notifications créées, à diffuser après la transaction.
   */
  acceptAll(targetId: string): Promise<CreatedNotification[]>;
}

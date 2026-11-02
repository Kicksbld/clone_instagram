/**
 * Demandes d'abonnement (table `follow_requests`, T20) : `requesterId` demande à suivre le compte
 * privé `targetId`. Écrites dans la transaction de l'action, avec leurs notifications (ADR-026).
 */
export interface FollowRequestRepository {
  /** Crée la demande ; `false`, sans effet, si elle existait déjà. */
  add(requesterId: string, targetId: string): Promise<boolean>;
  /** Supprime la demande ; `false`, sans effet, si elle n'existait pas. */
  remove(requesterId: string, targetId: string): Promise<boolean>;
  /**
   * Supprime toutes les demandes reçues par `targetId` (passage en public) et renvoie leurs
   * demandeurs, dans l'ordre des demandes.
   */
  removeAllTo(targetId: string): Promise<string[]>;
}

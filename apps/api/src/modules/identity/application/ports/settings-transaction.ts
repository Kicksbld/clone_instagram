import type { FollowRequestAccepter } from '../../../../shared/application/follow-request-accepter.ts';
import type { ProfileRepository } from './profile-repository.ts';

/**
 * Repositories d'un changement de paramètres : le profil, et l'acceptation des demandes
 * d'abonnement en attente au passage en public (port transverse, ADR-006, ADR-032), dans une
 * transaction.
 */
export interface SettingsTransaction {
  profiles: ProfileRepository;
  followRequests: FollowRequestAccepter;
}

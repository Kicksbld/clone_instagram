import type { FollowRequestAcceptance } from '../../../social/application/follow-request-acceptance.ts';
import type { ProfileRepository } from './profile-repository.ts';

/**
 * Repositories d'un changement de paramètres : le profil, et l'acceptation des demandes
 * d'abonnement en attente au passage en public (module `social`, ADR-006), dans une transaction.
 */
export interface SettingsTransaction extends FollowRequestAcceptance {
  profiles: ProfileRepository;
}

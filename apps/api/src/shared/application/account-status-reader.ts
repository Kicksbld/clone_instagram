import type { AccountStatus } from '../domain/visibility.ts';

/**
 * Statut du compte de l'appelant, lu par la vérification d'authentification à chaque requête `/v1`.
 * Un compte `deleted` n'a plus accès (T13) ; T14 y ajoute le refus des comptes suspendus ou bannis.
 */
export interface AccountStatusReader {
  /** `null` tant que l'onboarding n'est pas terminé (aucun profil). */
  statusOf(userId: string): Promise<AccountStatus | null>;
}

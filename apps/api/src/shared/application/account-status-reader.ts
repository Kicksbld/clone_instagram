import type { AccountStatus } from '../domain/visibility.ts';

/**
 * Statut du compte de l'appelant, lu par la vérification d'authentification à chaque requête `/v1`.
 * Un compte `deleted` n'a plus accès (T13) ; un compte suspendu ou banni n'atteint que `GET /v1/me`
 * et `DELETE /v1/me` (T14, ADR-005).
 */
export interface AccountStatusReader {
  /** `null` tant que l'onboarding n'est pas terminé (aucun profil). */
  statusOf(userId: string): Promise<AccountStatus | null>;
}

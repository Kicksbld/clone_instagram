/** Supabase Auth ne répond pas (réseau, délai, erreur inattendue). */
export class AuthAccountsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Supabase Auth injoignable', { cause });
    this.name = 'AuthAccountsUnavailableError';
  }
}

/** Comptes Supabase Auth (ADR-018) : identifiant = identifiant de profil. */
export interface AuthAccounts {
  /**
   * Supprime l'utilisateur et ses sessions (plus aucun rafraîchissement de jeton) ; sans effet s'il
   * n'existe plus. Lève `AuthAccountsUnavailableError`.
   */
  deleteUser(userId: string): Promise<void>;
}

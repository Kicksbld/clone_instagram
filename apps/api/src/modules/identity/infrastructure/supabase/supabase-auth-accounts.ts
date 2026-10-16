import {
  type AuthAccounts,
  AuthAccountsUnavailableError,
} from '../../application/ports/auth-accounts.ts';

const TIMEOUT_MS = 5000;

export interface SupabaseAuthAccountsOptions {
  supabaseUrl: string;
  /** Clé secrète (service role) : l'API d'administration de Supabase Auth l'exige. */
  secretKey: string;
  fetch?: typeof fetch;
}

/** Adapter `fetch` de l'API d'administration de Supabase Auth (`/auth/v1/admin`), sans SDK. */
export class SupabaseAuthAccounts implements AuthAccounts {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SupabaseAuthAccountsOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async deleteUser(userId: string): Promise<void> {
    const url = new URL(
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      this.options.supabaseUrl,
    );
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'DELETE',
        headers: {
          apikey: this.options.secretKey,
          authorization: `Bearer ${this.options.secretKey}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new AuthAccountsUnavailableError(error);
    }
    // 404 : utilisateur déjà supprimé (appel rejoué).
    if (!response.ok && response.status !== 404) {
      throw new AuthAccountsUnavailableError(`HTTP ${response.status}`);
    }
  }
}

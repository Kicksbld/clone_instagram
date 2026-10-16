import { describe, expect, it } from 'vitest';

import { AuthAccountsUnavailableError } from '../../../src/modules/identity/application/ports/auth-accounts.ts';
import { SupabaseAuthAccounts } from '../../../src/modules/identity/infrastructure/supabase/supabase-auth-accounts.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';

function accounts(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const instance = new SupabaseAuthAccounts({
    supabaseUrl: 'http://127.0.0.1:54321',
    secretKey: 'sb_secret_test',
    fetch: (input, init) => {
      calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
      return Promise.resolve(respond());
    },
  });
  return { instance, calls };
}

describe('SupabaseAuthAccounts', () => {
  it('supprime l’utilisateur par l’API d’administration, avec la clé secrète', async () => {
    const { instance, calls } = accounts(() => new Response(null, { status: 200 }));

    await instance.deleteUser(ME);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://127.0.0.1:54321/auth/v1/admin/users/${ME}`);
    expect(calls[0]?.init).toMatchObject({
      method: 'DELETE',
      headers: { apikey: 'sb_secret_test', authorization: 'Bearer sb_secret_test' },
    });
  });

  it('utilisateur déjà supprimé (404) → succès', async () => {
    const { instance } = accounts(() => new Response(null, { status: 404 }));

    await expect(instance.deleteUser(ME)).resolves.toBeUndefined();
  });

  it.each([
    ['erreur serveur', () => new Response(null, { status: 500 })],
    ['réseau', () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s → AuthAccountsUnavailableError', async (_label, respond) => {
    const { instance } = accounts(respond);

    await expect(instance.deleteUser(ME)).rejects.toBeInstanceOf(AuthAccountsUnavailableError);
  });
});

import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * ADR-004 : la clé publique Supabase (embarquée dans l'app) ne lit aucune table.
 * Vérification contre un Supabase réel, hors de `pnpm test` : `pnpm test:supabase` vise le `.env`
 * (Supabase CLI) ; pour la démo, passer `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` de Supabase Cloud
 * dans la commande (elles priment sur le `.env`).
 */
const envFile = new URL('../../../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} manquante : la renseigner dans .env ou devant la commande (README § 7)`,
    );
  return value;
}

const supabaseUrl = requiredEnv('SUPABASE_URL');
const headers = { apikey: requiredEnv('SUPABASE_PUBLISHABLE_KEY') };

describe('clé publique Supabase', () => {
  it('est acceptée par Supabase (témoin : les refus ci-dessous ne viennent pas d’une clé invalide)', async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers });
    expect(response.status).toBe(200);
  });

  it('n’atteint pas l’API de données (PostgREST désactivée)', async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, { headers });
    expect(response.ok).toBe(false);
  });

  it('ne lit aucune table via PostgREST', async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*`, { headers });
    expect(response.ok).toBe(false);
  });

  it('ne lit aucune table via GraphQL', async () => {
    const response = await fetch(`${supabaseUrl}/graphql/v1`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' }),
    });
    expect(response.ok).toBe(false);
  });
});

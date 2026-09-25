import { existsSync } from 'node:fs';

import { createDatabase } from '@clone/db';

/**
 * Postgres réel pour les tests d'adapters (ADR-014) : `DATABASE_URL` du `.env` en local
 * (Supabase CLI), service Postgres en CI. Schéma à jour requis : `pnpm db:migrate`.
 */
const envFile = new URL('../../../../.env', import.meta.url);
if (!process.env['DATABASE_URL'] && existsSync(envFile)) process.loadEnvFile(envFile);

export function connectTestDatabase() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL manquante : la renseigner dans .env (README)');
  return createDatabase(url);
}

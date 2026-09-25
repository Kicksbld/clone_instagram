import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.ts';

/** Connexion Drizzle partagée par l'API et le worker. */
export function createDatabase(url: string) {
  // `prepare: false` : compatible avec les poolers de Supabase (ADR-009).
  const client = postgres(url, { prepare: false });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];

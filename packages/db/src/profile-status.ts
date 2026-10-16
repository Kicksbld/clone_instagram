import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Executor } from './client.ts';
import { profiles, type ProfileRow } from './schema/profiles.ts';

export type ProfileStatus = ProfileRow['status'];

/**
 * Transition de statut d'un profil (suspension, bannissement, réactivation, T14) : `UPDATE`
 * conditionnel, comme la machine à états des médias (ADR-008). `false` = zéro ligne touchée : profil
 * absent, ou statut actuel hors de `from`. Aucune lecture avant l'écriture.
 */
export async function transitionProfileStatus(
  db: Executor,
  id: string,
  from: readonly ProfileStatus[],
  to: ProfileStatus,
): Promise<boolean> {
  const rows = await db
    .update(profiles)
    .set({ status: to, updatedAt: sql`now()` })
    .where(and(eq(profiles.id, id), inArray(profiles.status, [...from])))
    .returning({ id: profiles.id });
  return rows.length === 1;
}

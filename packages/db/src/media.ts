import { and, asc, eq, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';

import type { Database, Executor } from './client.ts';
import {
  media,
  type ImageVariantPaths,
  type MediaFailureReason,
  type MediaPurpose,
  type MediaRow,
  type MediaStatus,
} from './schema/media.ts';

/**
 * Machine à états et rattachement des médias (ADR-008), partagés par l'API et le worker.
 * Chaque fonction est un `UPDATE` conditionnel : `false` = zéro ligne touchée, l'opération
 * n'était pas permise (transition invalide, média déjà attaché…). Aucune ne lit avant d'écrire.
 */

/** Délai après lequel un média jamais attaché est purgé (uploads abandonnés compris). */
export const ORPHAN_MEDIA_DELAY = '24 hours';

/** Relit un média (le worker relit toujours l'état en base avant d'agir, ADR-015). */
export async function findMediaById(db: Executor, id: string): Promise<MediaRow | null> {
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  return row ?? null;
}

async function transition(
  db: Executor,
  id: string,
  from: MediaStatus,
  set: PgUpdateSetSource<typeof media> & { status: MediaStatus },
): Promise<boolean> {
  const rows = await db
    .update(media)
    .set(set)
    .where(and(eq(media.id, id), eq(media.status, from)))
    .returning({ id: media.id });
  return rows.length === 1;
}

/** `pending_upload → uploaded` (API, `POST /v1/media/{id}/complete`). */
export function markUploaded(db: Executor, id: string): Promise<boolean> {
  return transition(db, id, 'pending_upload', { status: 'uploaded' });
}

/** `uploaded → processing` (worker). */
export function markProcessing(db: Executor, id: string): Promise<boolean> {
  return transition(db, id, 'uploaded', { status: 'processing' });
}

/** `processing → ready` avec les variantes et les dimensions de l'image (worker). */
export function markReady(
  db: Executor,
  id: string,
  result: { variants: ImageVariantPaths; width: number; height: number },
): Promise<boolean> {
  return transition(db, id, 'processing', {
    status: 'ready',
    variants: result.variants,
    width: result.width,
    height: result.height,
    processedAt: sql`now()`,
  });
}

/** `processing → failed` avec le motif (worker). */
export function markFailed(db: Executor, id: string, reason: MediaFailureReason): Promise<boolean> {
  return transition(db, id, 'processing', {
    status: 'failed',
    failureReason: reason,
    processedAt: sql`now()`,
  });
}

/**
 * Rattache un média à un contenu : seulement par son propriétaire, s'il est `ready`, du bon
 * `purpose` et jamais attaché. À appeler dans la transaction de l'écriture qui l'utilise.
 */
export async function attachMedia(
  db: Executor,
  target: { id: string; ownerId: string; purpose: MediaPurpose },
): Promise<boolean> {
  const rows = await db
    .update(media)
    .set({ attachedAt: sql`now()` })
    .where(
      and(
        eq(media.id, target.id),
        eq(media.ownerId, target.ownerId),
        eq(media.status, 'ready'),
        eq(media.purpose, target.purpose),
        isNull(media.attachedAt),
      ),
    )
    .returning({ id: media.id });
  return rows.length === 1;
}

/** Détache un média qui n'est plus utilisé ; la purge l'efface ensuite. Jamais rattaché à nouveau. */
export async function detachMedia(db: Executor, id: string): Promise<boolean> {
  const rows = await db
    .update(media)
    .set({ detachedAt: sql`now()` })
    .where(and(eq(media.id, id), isNotNull(media.attachedAt), isNull(media.detachedAt)))
    .returning({ id: media.id });
  return rows.length === 1;
}

/** Jamais attaché depuis plus de 24 h, ou détaché. */
function purgeable(): SQL | undefined {
  return or(
    and(
      isNull(media.attachedAt),
      lt(media.createdAt, sql`now() - ${ORPHAN_MEDIA_DELAY}::interval`),
    ),
    isNotNull(media.detachedAt),
  );
}

export interface PurgeableMedia {
  id: string;
  originalPath: string;
  variants: ImageVariantPaths | null;
}

/** Médias à purger (`purge-orphan-media`), les plus anciens d'abord. */
export function findPurgeableMedia(db: Database, limit: number): Promise<PurgeableMedia[]> {
  return db
    .select({ id: media.id, originalPath: media.originalPath, variants: media.variants })
    .from(media)
    .where(purgeable())
    .orderBy(asc(media.createdAt), asc(media.id))
    .limit(limit);
}

/** Supprime la ligne si le média est toujours à purger ; `false` s'il a été attaché entre-temps. */
export async function deletePurgeableMedia(db: Executor, id: string): Promise<boolean> {
  const rows = await db
    .delete(media)
    .where(and(eq(media.id, id), purgeable()))
    .returning({ id: media.id });
  return rows.length === 1;
}

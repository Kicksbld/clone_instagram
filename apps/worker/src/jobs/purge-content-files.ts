import {
  deletePurgeableMedia,
  listDetachedPostMedia,
  STORAGE_BUCKETS,
  type Database,
} from '@clone/db';
import { PURGE_CONTENT_FILES } from '@clone/jobs';
import { UnrecoverableError } from 'bullmq';
import type { Logger } from 'pino';

import type { JobHandler } from '../processor.ts';
import type { WorkerStorage } from '../storage.ts';

export interface PurgeContentFilesDependencies {
  db: Database;
  storage: WorkerStorage;
  logger: Logger;
}

/**
 * `purge-content-files` (T15, ADR-008) : fichiers puis ligne des médias détachés d'un post supprimé
 * par modération, sans attendre `purge-orphan-media`. Fichiers d'abord : si leur suppression échoue,
 * les lignes restent et le job rejoué recommence. Sans média restant, aucun effet.
 */
export function purgeContentFiles({
  db,
  storage,
  logger,
}: PurgeContentFilesDependencies): JobHandler {
  return async (job) => {
    const payload = PURGE_CONTENT_FILES.payload.safeParse(job.data);
    if (!payload.success) {
      logger.error(
        { jobId: job.id, issues: payload.error.issues },
        'Payload purge-content-files invalide',
      );
      throw new UnrecoverableError('Payload purge-content-files invalide');
    }
    const { postId } = payload.data;

    const files = await listDetachedPostMedia(db, postId);
    await storage.remove(
      STORAGE_BUCKETS.uploads,
      files.map((file) => file.originalPath),
    );
    await storage.remove(
      STORAGE_BUCKETS.public,
      files.flatMap(({ variants }) =>
        variants ? [variants.thumb, variants.medium, variants.large] : [],
      ),
    );
    let purged = 0;
    for (const file of files) if (await deletePurgeableMedia(db, file.id)) purged++;

    logger.info({ postId, purged }, 'Fichiers du contenu supprimé purgés');
  };
}

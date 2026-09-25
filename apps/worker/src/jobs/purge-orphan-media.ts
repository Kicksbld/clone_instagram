import {
  deletePurgeableMedia,
  findPurgeableMedia,
  STORAGE_BUCKETS,
  type Database,
} from '@clone/db';
import type { Logger } from 'pino';

import type { JobHandler } from '../processor.ts';
import type { WorkerStorage } from '../storage.ts';

const BATCH_SIZE = 100;
/** Au plus 1 000 médias par passage ; la suite au passage suivant (toutes les heures). */
const MAX_BATCHES = 10;

export interface PurgeOrphanMediaDependencies {
  db: Database;
  storage: WorkerStorage;
  logger: Logger;
}

/**
 * `purge-orphan-media` (ADR-008) : fichiers puis ligne des médias jamais attachés après 24 h et des
 * médias détachés. Fichiers d'abord : si la suppression échoue, la ligne reste et le passage suivant
 * recommence.
 */
export function purgeOrphanMedia({
  db,
  storage,
  logger,
}: PurgeOrphanMediaDependencies): JobHandler {
  return async () => {
    let purged = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const candidates = await findPurgeableMedia(db, BATCH_SIZE);
      for (const media of candidates) {
        await storage.remove(STORAGE_BUCKETS.uploads, [media.originalPath]);
        if (media.variants) {
          const { thumb, medium, large } = media.variants;
          await storage.remove(STORAGE_BUCKETS.public, [thumb, medium, large]);
        }
        if (await deletePurgeableMedia(db, media.id)) purged++;
      }
      if (candidates.length < BATCH_SIZE) break;
    }
    logger.info({ purged }, 'Médias orphelins purgés');
  };
}

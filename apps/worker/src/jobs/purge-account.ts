import {
  listOwnerMediaFiles,
  profiles,
  purgeAccountData,
  STORAGE_BUCKETS,
  type Database,
} from '@clone/db';
import { PURGE_ACCOUNT } from '@clone/jobs';
import { UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

import type { JobHandler } from '../processor.ts';
import type { AnalyticsPersons, SubscriptionCustomers } from '../saas.ts';
import type { WorkerStorage } from '../storage.ts';

export interface PurgeAccountDependencies {
  db: Database;
  storage: WorkerStorage;
  logger: Logger;
  customers: SubscriptionCustomers;
  /** `null` sans clé personnelle PostHog : étape sautée, avec un avertissement. */
  persons: AnalyticsPersons | null;
}

/**
 * `purge-account` (T13, ADR-008) : suppression réelle d'un compte `deleted`. Dans l'ordre : fichiers
 * Storage, données en base (une transaction, `purgeAccountData`), client RevenueCat, personne
 * PostHog. Chaque étape est idempotente : une panne fait échouer le job, rejoué ensuite ; un profil
 * déjà absent signifie que la base a été purgée par une tentative précédente.
 */
export function purgeAccount({
  db,
  storage,
  logger,
  customers,
  persons,
}: PurgeAccountDependencies): JobHandler {
  return async (job) => {
    const payload = PURGE_ACCOUNT.payload.safeParse(job.data);
    if (!payload.success) {
      logger.error(
        { jobId: job.id, issues: payload.error.issues },
        'Payload purge-account invalide',
      );
      throw new UnrecoverableError('Payload purge-account invalide');
    }
    const { profileId } = payload.data;

    const [profile] = await db
      .select({ status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    if (profile && profile.status !== 'deleted') {
      // Garde-fou : seul `DELETE /v1/me` enfile ce job, après le passage en `deleted`.
      logger.error(
        { jobId: job.id, profileId },
        'purge-account sur un compte non supprimé : ignoré',
      );
      return;
    }

    if (profile) {
      const files = await listOwnerMediaFiles(db, profileId);
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
      await db.transaction((tx) => purgeAccountData(tx, profileId));
    }

    await customers.delete(profileId);
    if (persons) await persons.delete(profileId);
    else logger.warn({ profileId }, 'PostHog non configuré : personne non supprimée');

    logger.info({ profileId }, 'Compte purgé');
  };
}

import {
  findMediaById,
  markFailed,
  markProcessing,
  markReady,
  STORAGE_BUCKETS,
  type Database,
  type ImageVariantPaths,
  type MediaFailureReason,
} from '@clone/db';
import { PROCESS_IMAGE, type ProcessImageResult } from '@clone/jobs';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { checkImage, renderVariants } from '../images.ts';
import type { JobHandler } from '../processor.ts';
import type { WorkerStorage } from '../storage.ts';

export interface ProcessImageDependencies {
  db: Database;
  storage: WorkerStorage;
  logger: Logger;
}

/** Chemins des variantes, dérivés du média : un job rejoué réécrit les mêmes fichiers. */
export function variantPaths(mediaId: string): ImageVariantPaths {
  return {
    thumb: `${mediaId}/thumb.webp`,
    medium: `${mediaId}/medium.webp`,
    large: `${mediaId}/large.webp`,
  };
}

/** Dernière tentative : le job ne sera plus relancé par BullMQ. */
function isLastAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/**
 * `process-image` (ADR-008) : revalide l'image réelle, écrit les variantes WebP sans EXIF dans
 * `media-public`, passe le média en `ready` puis supprime l'original. Idempotent : relit l'état en base.
 */
export function processImage({ db, storage, logger }: ProcessImageDependencies): JobHandler {
  async function fail(mediaId: string, reason: MediaFailureReason): Promise<never> {
    await markFailed(db, mediaId, reason);
    throw new UnrecoverableError(`Média ${mediaId} refusé : ${reason}`);
  }

  async function process(mediaId: string): Promise<ProcessImageResult> {
    const media = await findMediaById(db, mediaId);
    if (!media) throw new UnrecoverableError(`Média ${mediaId} introuvable`);
    const result = { mediaId, ownerId: media.ownerId };

    switch (media.status) {
      case 'ready':
        // Job rejoué après le passage en `ready` : seule la suppression de l'original peut manquer.
        await storage.remove(STORAGE_BUCKETS.uploads, [media.originalPath]);
        return result;
      case 'uploaded':
        // Zéro ligne : un autre traitement vient de le prendre ; relu à la tentative suivante.
        if (!(await markProcessing(db, mediaId))) throw new Error(`Média ${mediaId} déjà pris`);
        break;
      case 'processing':
        // Tentative précédente interrompue : on reprend.
        break;
      default:
        throw new UnrecoverableError(`Média ${mediaId} au statut ${media.status}`);
    }

    const original = await storage.download(STORAGE_BUCKETS.uploads, media.originalPath);
    if (!original) return fail(mediaId, 'processing_error');

    const check = await checkImage(original);
    if (!check.ok) return fail(mediaId, check.reason);

    const rendered = await renderVariants(original);
    const paths = variantPaths(mediaId);
    await Promise.all(
      (Object.keys(paths) as (keyof ImageVariantPaths)[]).map((name) =>
        storage.upload(STORAGE_BUCKETS.public, paths[name], rendered[name], 'image/webp'),
      ),
    );

    const ready = await markReady(db, mediaId, {
      variants: paths,
      width: check.width,
      height: check.height,
    });
    if (!ready) throw new Error(`Média ${mediaId} : passage en ready refusé`);

    await storage.remove(STORAGE_BUCKETS.uploads, [media.originalPath]);
    return result;
  }

  return async (job) => {
    const payload = PROCESS_IMAGE.payload.safeParse(job.data);
    if (!payload.success) {
      logger.error(
        { jobId: job.id, issues: payload.error.issues },
        'Payload process-image invalide',
      );
      throw new UnrecoverableError('Payload process-image invalide');
    }
    const { mediaId } = payload.data;

    try {
      return PROCESS_IMAGE.result.parse(await process(mediaId));
    } catch (error) {
      if (!(error instanceof UnrecoverableError) && isLastAttempt(job)) {
        await markFailed(db, mediaId, 'processing_error');
      }
      throw error;
    }
  };
}

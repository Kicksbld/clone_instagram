import {
  findMediaById,
  markFailed,
  markProcessing,
  markReady,
  STORAGE_BUCKETS,
  type Database,
  type MediaFailureReason,
} from '@clone/db';
import { PROCESS_VIDEO, type ProcessVideoResult } from '@clone/jobs';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { InvalidVideo, renderVideo } from '../videos.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JobHandler } from '../processor.ts';
import type { WorkerStorage } from '../storage.ts';

export interface ProcessVideoDependencies {
  db: Database;
  storage: WorkerStorage;
  logger: Logger;
  timeoutMs?: number;
}

/** Dernière tentative : le job ne sera plus relancé par BullMQ. */
function isLastAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/**
 * `process-video` (ADR-008) : revalide la vidéo, écrit le HLS et la miniature sans métadonnées dans
 * `media-public`, passe le média en `ready` puis supprime l'original. Idempotent : relit l'état en base.
 */
export function processVideo({
  db,
  storage,
  logger,
  timeoutMs = 10 * 60 * 1000,
}: ProcessVideoDependencies): JobHandler {
  async function fail(mediaId: string, reason: MediaFailureReason): Promise<never> {
    await markFailed(db, mediaId, reason);
    throw new UnrecoverableError(`Média ${mediaId} refusé : ${reason}`);
  }

  async function process(
    mediaId: string,
    signal: AbortSignal,
    deadline: number,
  ): Promise<ProcessVideoResult> {
    const scopedStorage = storage.withSignal(signal);
    const media = await findMediaById(db, mediaId);
    signal.throwIfAborted();
    if (!media) {
      await scopedStorage.removeDirectory(STORAGE_BUCKETS.public, mediaId);
      throw new UnrecoverableError(`Média ${mediaId} introuvable`);
    }
    const result = { mediaId, ownerId: media.ownerId };

    switch (media.status) {
      case 'ready':
        // Job rejoué après le passage en `ready` : seule la suppression de l'original peut manquer.
        await scopedStorage.remove(STORAGE_BUCKETS.uploads, [media.originalPath]);
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

    const original = await scopedStorage.download(STORAGE_BUCKETS.uploads, media.originalPath);
    if (!original) return fail(mediaId, 'processing_error');

    const directory = await mkdtemp(join(tmpdir(), 'reel-'));
    try {
      const rendered = await renderVideo(original, directory, deadline, signal);
      for (const file of rendered.files) {
        await scopedStorage.upload(
          STORAGE_BUCKETS.public,
          `${mediaId}/${file.path}`,
          file.data,
          file.contentType,
        );
      }
      signal.throwIfAborted();
      const ready = await markReady(db, mediaId, {
        variants: { hls: `${mediaId}/hls/master.m3u8`, thumbnail: `${mediaId}/thumbnail.webp` },
        width: rendered.width,
        height: rendered.height,
        durationMs: rendered.durationMs,
      });
      if (!ready) throw new Error(`Média ${mediaId} : passage en ready refusé`);
    } catch (error) {
      if (!signal.aborted && !(await findMediaById(db, mediaId))) {
        await scopedStorage.removeDirectory(STORAGE_BUCKETS.public, mediaId);
        throw new UnrecoverableError(`Média ${mediaId} supprimé pendant le traitement`);
      }
      if (error instanceof InvalidVideo) return await fail(mediaId, error.reason);
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    await scopedStorage.remove(STORAGE_BUCKETS.uploads, [media.originalPath]);
    return result;
  }

  return async (job) => {
    const payload = PROCESS_VIDEO.payload.safeParse(job.data);
    if (!payload.success) {
      logger.error(
        { jobId: job.id, issues: payload.error.issues },
        'Payload process-video invalide',
      );
      throw new UnrecoverableError('Payload process-video invalide');
    }
    const { mediaId } = payload.data;

    const controller = new AbortController();
    const deadline = Date.now() + timeoutMs;
    const timeoutError = new Error('Traitement vidéo trop long');
    const timer = setTimeout(() => {
      controller.abort(timeoutError);
    }, timeoutMs);
    const expired = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          reject(timeoutError);
        },
        {
          once: true,
        },
      );
    });
    try {
      return PROCESS_VIDEO.result.parse(
        await Promise.race([process(mediaId, controller.signal, deadline), expired]),
      );
    } catch (error) {
      if (!(error instanceof UnrecoverableError) && isLastAttempt(job)) {
        await markFailed(db, mediaId, 'processing_error');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

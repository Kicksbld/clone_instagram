import {
  DEFAULT_JOB_OPTIONS,
  PROCESS_IMAGE,
  processImageJobId,
  PURGE_ACCOUNT,
  purgeAccountJobId,
  PURGE_CONTENT_FILES,
  purgeContentFilesJobId,
} from '@clone/jobs';
import { Queue } from 'bullmq';

import type { JobQueue } from '../../application/job-queue.ts';

/** Adapter BullMQ du port `JobQueue` (ADR-015) : payloads validés par leur schéma avant l'envoi. */
export class BullMqJobQueue implements JobQueue {
  private readonly media: Queue;
  private readonly maintenance: Queue;

  constructor(redisUrl: string) {
    // `family: 0` : Redis joignable en IPv4 ou IPv6 (réseau privé Railway, ADR-009).
    const connection = { url: redisUrl, family: 0 };
    this.media = new Queue(PROCESS_IMAGE.queue, { connection });
    this.maintenance = new Queue(PURGE_ACCOUNT.queue, { connection });
  }

  async enqueueImageProcessing(mediaId: string): Promise<void> {
    const payload = PROCESS_IMAGE.payload.parse({ mediaId });
    // Même `jobId` pour un même média : BullMQ ignore l'ajout si le job existe déjà.
    await this.media.add(PROCESS_IMAGE.name, payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: processImageJobId(mediaId),
    });
  }

  async enqueueAccountPurge(profileId: string): Promise<void> {
    const payload = PURGE_ACCOUNT.payload.parse({ profileId });
    await this.maintenance.add(PURGE_ACCOUNT.name, payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: purgeAccountJobId(profileId),
    });
  }

  async enqueueContentFilesPurge(postId: string): Promise<void> {
    const payload = PURGE_CONTENT_FILES.payload.parse({ postId });
    await this.maintenance.add(PURGE_CONTENT_FILES.name, payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: purgeContentFilesJobId(postId),
    });
  }

  async close(): Promise<void> {
    await Promise.all([this.media.close(), this.maintenance.close()]);
  }
}

import { DEFAULT_JOB_OPTIONS, PROCESS_IMAGE, processImageJobId } from '@clone/jobs';
import { Queue } from 'bullmq';

import type { JobQueue } from '../../application/job-queue.ts';

/** Adapter BullMQ du port `JobQueue` (ADR-015) : payloads validés par leur schéma avant l'envoi. */
export class BullMqJobQueue implements JobQueue {
  private readonly media: Queue;

  constructor(redisUrl: string) {
    // `family: 0` : Redis joignable en IPv4 ou IPv6 (réseau privé Railway, ADR-009).
    this.media = new Queue(PROCESS_IMAGE.queue, { connection: { url: redisUrl, family: 0 } });
  }

  async enqueueImageProcessing(mediaId: string): Promise<void> {
    const payload = PROCESS_IMAGE.payload.parse({ mediaId });
    // Même `jobId` pour un même média : BullMQ ignore l'ajout si le job existe déjà.
    await this.media.add(PROCESS_IMAGE.name, payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: processImageJobId(mediaId),
    });
  }

  close(): Promise<void> {
    return this.media.close();
  }
}

import { PROCESS_IMAGE, PROCESS_VIDEO } from '@clone/jobs';
import { Queue, QueueEvents } from 'bullmq';

import type { RealtimePublisher } from '../../../../shared/application/realtime-publisher.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { MediaRepository } from '../../application/ports/media-repository.ts';
import { hasPublicVariants } from '../../domain/media.ts';

/** Queue notifications are hints: only the persisted status and owner authorize publication. */
export class MediaCompletionEvents {
  constructor(
    private readonly media: Pick<MediaRepository, 'findById'>,
    private readonly urls: PublicMediaUrls,
    private readonly realtime: RealtimePublisher,
  ) {}

  async completed(result: unknown): Promise<void> {
    const parsed = PROCESS_IMAGE.result.safeParse(result);
    if (!parsed.success) return;
    const media = await this.media.findById(parsed.data.mediaId);
    if (
      !media ||
      media.ownerId !== parsed.data.ownerId ||
      media.status !== 'ready' ||
      !media.variants
    )
      return;
    this.realtime.publish([media.ownerId], {
      type: 'media.ready',
      data: {
        mediaId: media.id,
        // A message photo is private: no public URL, the app asks for a signed one (ADR-023).
        ...(hasPublicVariants(media) && { variants: this.urls.of(media.variants) }),
      },
    });
  }

  async failed(payload: unknown): Promise<void> {
    const parsed = PROCESS_IMAGE.payload.safeParse(payload);
    if (!parsed.success) return;
    const media = await this.media.findById(parsed.data.mediaId);
    if (!media || media.status !== 'failed' || !media.failureReason) return;
    this.realtime.publish([media.ownerId], {
      type: 'media.failed',
      data: { mediaId: media.id, reason: media.failureReason },
    });
  }
}

/** Owns the blocking QueueEvents connection and the queue used to retrieve failed job payloads. */
export class MediaQueueEvents {
  private readonly events: QueueEvents;
  private readonly queue: Queue;

  constructor(
    redisUrl: string,
    completion: MediaCompletionEvents,
    onError: (error: unknown) => void,
    kind: 'image' | 'video' = 'image',
  ) {
    const processing = kind === 'video' ? PROCESS_VIDEO : PROCESS_IMAGE;
    const connection = { url: redisUrl, family: 0 };
    this.queue = new Queue(processing.queue, { connection });
    this.events = new QueueEvents(processing.queue, { connection });
    this.events.on('error', onError);
    this.queue.on('error', onError);
    this.events.on('completed', ({ returnvalue }) => {
      void completion.completed(returnvalue).catch(onError);
    });
    this.events.on('failed', ({ jobId }) => {
      void this.queue
        .getJob(jobId)
        .then(async (job) => {
          if (job?.name === processing.name) await completion.failed(job.data);
        })
        .catch(onError);
    });
  }

  async ready(): Promise<void> {
    await this.events.waitUntilReady();
  }

  async close(): Promise<void> {
    await this.events.close();
    await this.queue.close();
  }
}

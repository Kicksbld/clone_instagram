import type { JobQueue } from '../../src/shared/application/job-queue.ts';
import type { UnitOfWork } from '../../src/shared/application/unit-of-work.ts';
import type { MediaStorage } from '../../src/modules/media/application/ports/media-storage.ts';

/** File de jobs en mémoire : enregistre les médias enfilés, sans doublon comme le `jobId` BullMQ. */
export class InMemoryJobQueue implements JobQueue {
  readonly imageProcessing = new Set<string>();

  enqueueImageProcessing(mediaId: string): Promise<void> {
    this.imageProcessing.add(mediaId);
    return Promise.resolve();
  }
}

/** Storage factice : URL d'upload déterministe, valable 2 h. */
export class FakeMediaStorage implements MediaStorage {
  constructor(private readonly now: () => Date) {}

  createUploadUrl(path: string): Promise<{ url: string; expiresAt: Date }> {
    return Promise.resolve({
      url: `https://storage.test/upload/uploads/${path}?token=test`,
      expiresAt: new Date(this.now().getTime() + 2 * 60 * 60 * 1000),
    });
  }
}

/** `UnitOfWork` en mémoire : exécute sur les repositories en mémoire, sans annulation. */
export class InMemoryUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(private readonly scope: Scope) {}

  run<T>(work: (scope: Scope) => Promise<T>): Promise<T> {
    return work(this.scope);
  }
}

export const sequentialIds = (prefix = '0199a1b2-0000-7000-9000-') => {
  let next = 0;
  return { next: () => `${prefix}${String(++next).padStart(12, '0')}` };
};

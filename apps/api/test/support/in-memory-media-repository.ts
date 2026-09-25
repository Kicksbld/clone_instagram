import type {
  MediaRepository,
  NewMedia,
} from '../../src/modules/media/application/ports/media-repository.ts';
import type { Media, MediaPurpose } from '../../src/modules/media/domain/media.ts';

/** Adapter en mémoire (ADR-005) : mêmes règles que les `UPDATE` conditionnels de `packages/db`. */
export class InMemoryMediaRepository implements MediaRepository {
  readonly rows = new Map<string, Media & { detachedAt: Date | null }>();

  constructor(private readonly ownerExists: (ownerId: string) => boolean = () => true) {}

  add(media: Partial<Media> & Pick<Media, 'id' | 'ownerId'>): Media {
    const row = {
      kind: 'image' as const,
      purpose: 'avatar' as const,
      status: 'pending_upload' as const,
      originalPath: `${media.ownerId}/${media.id}`,
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
      variants: null,
      failureReason: null,
      attachedAt: null,
      detachedAt: null,
      ...media,
    };
    this.rows.set(row.id, row);
    return row;
  }

  /** Média prêt, avec les variantes que le worker aurait écrites. */
  addReady(media: Partial<Media> & Pick<Media, 'id' | 'ownerId'>): Media {
    return this.add({
      status: 'ready',
      variants: {
        thumb: `${media.id}/thumb.webp`,
        medium: `${media.id}/medium.webp`,
        large: `${media.id}/large.webp`,
      },
      ...media,
    });
  }

  create(media: NewMedia): Promise<Media | null> {
    if (!this.ownerExists(media.ownerId)) return Promise.resolve(null);
    return Promise.resolve(this.add(media));
  }

  findById(id: string): Promise<Media | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  markUploaded(id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (row?.status !== 'pending_upload') return Promise.resolve(false);
    this.rows.set(id, { ...row, status: 'uploaded' });
    return Promise.resolve(true);
  }

  attach(target: { id: string; ownerId: string; purpose: MediaPurpose }): Promise<boolean> {
    const row = this.rows.get(target.id);
    const allowed =
      row?.ownerId === target.ownerId &&
      row.status === 'ready' &&
      row.purpose === target.purpose &&
      row.attachedAt === null;
    if (!allowed) return Promise.resolve(false);
    this.rows.set(row.id, { ...row, attachedAt: new Date() });
    return Promise.resolve(true);
  }

  detach(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row?.attachedAt && !row.detachedAt) this.rows.set(id, { ...row, detachedAt: new Date() });
    return Promise.resolve();
  }
}

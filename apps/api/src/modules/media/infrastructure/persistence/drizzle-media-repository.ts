import {
  attachMedia,
  detachMedia,
  markUploaded,
  media,
  type Executor,
  type MediaRow,
} from '@clone/db';
import { eq } from 'drizzle-orm';

import type { MediaRepository, NewMedia } from '../../application/ports/media-repository.ts';
import type { Media, MediaPurpose } from '../../domain/media.ts';

function toMedia(row: MediaRow): Media {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    purpose: row.purpose,
    status: row.status,
    originalPath: row.originalPath,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    variants: row.variants,
    failureReason: row.failureReason,
    attachedAt: row.attachedAt,
  };
}

/** Violation de la clé étrangère `constraint` (erreur Postgres 23503), y compris enveloppée par Drizzle. */
function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if ('code' in current && current.code === '23503' && 'constraint_name' in current) {
      return current.constraint_name === constraint;
    }
  }
  return false;
}

/** Sur une connexion ou dans une transaction (`UnitOfWork`). */
export class DrizzleMediaRepository implements MediaRepository {
  constructor(private readonly db: Executor) {}

  async create(values: NewMedia): Promise<Media | null> {
    try {
      const [row] = await this.db.insert(media).values(values).returning();
      if (!row) throw new Error('INSERT sans ligne renvoyée');
      return toMedia(row);
    } catch (error) {
      if (isForeignKeyViolation(error, 'media_owner_id_profiles_id_fk')) return null;
      throw error;
    }
  }

  async findById(id: string): Promise<Media | null> {
    const [row] = await this.db.select().from(media).where(eq(media.id, id)).limit(1);
    return row ? toMedia(row) : null;
  }

  markUploaded(id: string): Promise<boolean> {
    return markUploaded(this.db, id);
  }

  attach(target: { id: string; ownerId: string; purpose: MediaPurpose }): Promise<boolean> {
    return attachMedia(this.db, target);
  }

  async detach(id: string): Promise<void> {
    await detachMedia(this.db, id);
  }
}

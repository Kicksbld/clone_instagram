import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles.ts';

/** Chemins Storage des variantes WebP d'une image, jamais des URL : l'API construit les URL (ADR-008). */
export interface ImageVariantPaths {
  thumb: string;
  medium: string;
  large: string;
}

/**
 * Buckets Supabase Storage (ADR-008) : `original_path` est relatif à `uploads`, les chemins de
 * `variants` à `media-public` (images de messages et instants dans `media-private`, P1).
 */
export const STORAGE_BUCKETS = {
  uploads: 'uploads',
  public: 'media-public',
  private: 'media-private',
} as const;

export const MEDIA_KINDS = ['image', 'video'] as const;
export const MEDIA_PURPOSES = ['post', 'story', 'avatar', 'message', 'instant'] as const;
export const MEDIA_STATUSES = [
  'pending_upload',
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;
export const MEDIA_FAILURE_REASONS = [
  'invalid_image',
  'file_too_large',
  'processing_error',
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
export type MediaFailureReason = (typeof MEDIA_FAILURE_REASONS)[number];

/**
 * Média uploadé (module `media`, ADR-008). Statut changé uniquement par les fonctions de
 * `media.ts` ; `attached_at` / `detached_at` portent l'usage du média, lu par la purge.
 */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references((): AnyPgColumn => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEDIA_KINDS }).notNull(),
    purpose: text('purpose', { enum: MEDIA_PURPOSES }).notNull(),
    status: text('status', { enum: MEDIA_STATUSES }).notNull().default('pending_upload'),
    originalPath: text('original_path').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    variants: jsonb('variants').$type<ImageVariantPaths>(),
    failureReason: text('failure_reason', { enum: MEDIA_FAILURE_REASONS }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, precision: 3 }),
    attachedAt: timestamp('attached_at', { withTimezone: true, precision: 3 }),
    detachedAt: timestamp('detached_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    index('media_owner_id_idx').on(table.ownerId),
    // Purge des médias jamais attachés et des médias détachés (`purge-orphan-media`).
    index('media_unattached_idx')
      .on(table.createdAt)
      .where(sql`${table.attachedAt} IS NULL`),
    index('media_detached_idx')
      .on(table.detachedAt)
      .where(sql`${table.detachedAt} IS NOT NULL`),
    check('media_kind', sql`${table.kind} IN ('image', 'video')`),
    check(
      'media_purpose',
      sql`${table.purpose} IN ('post', 'story', 'avatar', 'message', 'instant')`,
    ),
    check(
      'media_status',
      sql`${table.status} IN ('pending_upload', 'uploaded', 'processing', 'ready', 'failed')`,
    ),
    check(
      'media_failure_reason',
      sql`${table.failureReason} IS NULL OR (${table.status} = 'failed' AND ${table.failureReason} IN ('invalid_image', 'file_too_large', 'processing_error'))`,
    ),
    check('media_size_positive', sql`${table.sizeBytes} > 0`),
    check(
      'media_detached_after_attached',
      sql`${table.detachedAt} IS NULL OR ${table.attachedAt} IS NOT NULL`,
    ),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type MediaRow = typeof media.$inferSelect;
export type NewMediaRow = typeof media.$inferInsert;

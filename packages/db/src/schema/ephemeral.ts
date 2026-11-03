import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { media } from './media.ts';
import { profiles } from './profiles.ts';

export const STORY_AUDIENCES = ['everyone', 'close_friends'] as const;
export type StoryAudience = (typeof STORY_AUDIENCES)[number];

/**
 * Story photo (module `ephemeral`, ADR-025). Active tant que `expires_at > now()` et
 * `deleted_at IS NULL`, archivée ensuite : aucun job ne la supprime. `view_count` est modifié dans la
 * transaction qui crée la vue.
 */
export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    // Média détaché à la suppression puis purgé (ADR-008) : la story supprimée garde sa ligne.
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'set null' }),
    audience: text('audience', { enum: STORY_AUDIENCES }).notNull(),
    viewCount: integer('view_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    // Stories actives d'un auteur et bandeau (ADR-025).
    // Un média ne sert qu'une fois (ADR-008).
    unique('stories_media_id_key').on(table.mediaId),
    index('stories_author_expires_idx').on(table.authorId, table.expiresAt),
    check('stories_audience', sql`${table.audience} IN ('everyone', 'close_friends')`),
    check('stories_view_count_positive', sql`${table.viewCount} >= 0`),
    check('stories_expires_after_created', sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      'stories_media_until_deleted',
      sql`${table.deletedAt} IS NOT NULL OR ${table.mediaId} IS NOT NULL`,
    ),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

/** Une vue par compte et par story (ADR-025) ; l'auteur n'en a jamais. */
export const storyViews = pgTable(
  'story_views',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'story_views_pkey', columns: [table.storyId, table.viewerId] }),
    // Suppression du compte qui a vu (cascade).
    index('story_views_viewer_id_idx').on(table.viewerId),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type StoryRow = typeof stories.$inferSelect;
export type NewStoryRow = typeof stories.$inferInsert;
export type StoryViewRow = typeof storyViews.$inferSelect;

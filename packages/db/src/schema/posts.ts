import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { media } from './media.ts';
import { profiles } from './profiles.ts';

export const POST_KINDS = ['post', 'reel'] as const;
export type PostKind = (typeof POST_KINDS)[number];

/**
 * Post ou reel (module `posts`, ADR-005 ; une seule table, ADR-007). Suppression logique par
 * `deleted_at` : toutes les lectures filtrent `deleted_at IS NULL`. Compteurs dénormalisés,
 * modifiés dans la transaction de l'écriture (T8, T9).
 */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: POST_KINDS }).notNull(),
    caption: text('caption').notNull().default(''),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    repostCount: integer('repost_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    // Grille du profil et feed (ADR-007).
    index('posts_author_created_idx')
      .on(table.authorId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    check('posts_kind', sql`${table.kind} IN ('post', 'reel')`),
    check('posts_caption_length', sql`char_length(${table.caption}) <= 2200`),
    check(
      'posts_counts_positive',
      sql`${table.likeCount} >= 0 AND ${table.commentCount} >= 0 AND ${table.repostCount} >= 0`,
    ),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

/**
 * Médias d'un post, dans l'ordre d'affichage (`position` 0 à 9). Un média ne sert qu'une fois
 * (`attached_at`, ADR-008) : `media_id` est unique.
 */
export const postMedia = pgTable(
  'post_media',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    // Cascade : un média n'est effacé que détaché (purge, ADR-008) ou avec le compte (T13).
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
  },
  (table) => [
    primaryKey({ name: 'post_media_pkey', columns: [table.postId, table.position] }),
    unique('post_media_media_id_key').on(table.mediaId),
    check('post_media_position', sql`${table.position} BETWEEN 0 AND 9`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type PostMediaRow = typeof postMedia.$inferSelect;

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { posts } from './posts.ts';
import { profiles } from './profiles.ts';

/**
 * Likes des posts (module `engagement`, ADR-005) : une table par cible, pas de clé étrangère
 * polymorphe (ADR-007). `posts.like_count` est modifié dans la même transaction.
 */
export const postLikes = pgTable(
  'post_likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  // Un like par utilisateur et par post ; sert aussi à savoir si l'appelant aime un post.
  (table) => [primaryKey({ name: 'post_likes_pkey', columns: [table.userId, table.postId] })],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type PostLikeRow = typeof postLikes.$inferSelect;

/**
 * Commentaires et réponses (un seul niveau : `parent_id` vise un commentaire de premier niveau du
 * même post, vérifié par `CreateComment`). Suppression logique par `deleted_at` ; `posts.comment_count`
 * (réponses comprises) et `reply_count` du parent sont modifiés dans la même transaction (ADR-007).
 * `like_count` sert aux likes de commentaires (P1).
 */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, {
      onDelete: 'cascade',
    }),
    body: text('body').notNull(),
    likeCount: integer('like_count').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    // Commentaires de premier niveau d'un post, du plus récent au plus ancien (ADR-007).
    index('comments_post_created_idx')
      .on(table.postId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    // Réponses d'un commentaire.
    index('comments_parent_created_idx')
      .on(table.parentId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.parentId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    check('comments_body_length', sql`char_length(${table.body}) BETWEEN 1 AND 2200`),
    check('comments_counts_positive', sql`${table.likeCount} >= 0 AND ${table.replyCount} >= 0`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;

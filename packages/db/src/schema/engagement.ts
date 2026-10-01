import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

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

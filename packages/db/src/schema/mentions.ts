import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { comments } from './engagement.ts';
import { stories } from './ephemeral.ts';
import { posts } from './posts.ts';
import { profiles } from './profiles.ts';

export const mentions = pgTable(
  'mentions',
  {
    id: uuid('id').primaryKey(),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    textUsername: text('text_username').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'mentions_one_target',
      sql`num_nonnulls(${table.postId}, ${table.commentId}, ${table.storyId}) = 1`,
    ),
    unique('mentions_unique')
      .on(table.mentionedUserId, table.postId, table.commentId, table.storyId)
      .nullsNotDistinct(),
    index('mentions_post_idx').on(table.postId),
    index('mentions_comment_idx').on(table.commentId),
  ],
).enableRLS();

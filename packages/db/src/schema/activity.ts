import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { comments } from './engagement.ts';
import { posts } from './posts.ts';
import { profiles } from './profiles.ts';

/** Types de notification autorisés ; chaque tranche ajoute les siens (ADR-026). */
export const NOTIFICATION_TYPES = [
  'mention',
  'like',
  'comment',
  'comment_reply',
  'follow',
  'follow_request',
  'follow_accepted',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Notifications in-app (module `activity`, ADR-026), écrites dans la transaction de l'action et
 * retirées avec elle. Une colonne nullable par cible + `CHECK` par type (ADR-007). `group_key`
 * (`like:<postId>`, sinon `<type>:<id>`) sert au regroupement calculé à la lecture.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    // Stories (P1, ADR-025) : la clé étrangère arrive avec la table `stories`.
    storyId: uuid('story_id'),
    groupKey: text('group_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    // Activité d'un compte, de la plus récente à la plus ancienne (ADR-026).
    index('notifications_recipient_created_idx').on(table.recipientId, table.createdAt.desc()),
    // Un J'aime retiré puis remis ne crée pas de doublon : `NULL` comptés comme égaux.
    unique('notifications_unique')
      .on(
        table.recipientId,
        table.actorId,
        table.type,
        table.postId,
        table.commentId,
        table.storyId,
      )
      .nullsNotDistinct(),
    check(
      'notifications_type',
      sql`${table.type} IN ('mention', 'like', 'comment', 'comment_reply', 'follow', 'follow_request', 'follow_accepted')`,
    ),
    // Cibles par type : `like` → post ; `comment`, `comment_reply` → post + commentaire ;
    // `follow`, `follow_request`, `follow_accepted` → aucune.
    check(
      'notifications_targets',
      sql`${table.storyId} IS NULL AND CASE ${table.type}
        WHEN 'mention' THEN ${table.postId} IS NOT NULL
        WHEN 'like' THEN ${table.postId} IS NOT NULL AND ${table.commentId} IS NULL
        WHEN 'comment' THEN ${table.postId} IS NOT NULL AND ${table.commentId} IS NOT NULL
        WHEN 'comment_reply' THEN ${table.postId} IS NOT NULL AND ${table.commentId} IS NOT NULL
        WHEN 'follow' THEN ${table.postId} IS NULL AND ${table.commentId} IS NULL
        WHEN 'follow_request' THEN ${table.postId} IS NULL AND ${table.commentId} IS NULL
        WHEN 'follow_accepted' THEN ${table.postId} IS NULL AND ${table.commentId} IS NULL
        ELSE false END`,
    ),
    check('notifications_not_self', sql`${table.actorId} <> ${table.recipientId}`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;

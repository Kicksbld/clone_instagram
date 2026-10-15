import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { comments } from './engagement.ts';
import { posts } from './posts.ts';
import { profiles } from './profiles.ts';

export const REPORT_REASONS = [
  'spam',
  'nudity',
  'harassment',
  'violence',
  'hate',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'resolved_removed', 'resolved_dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Signalements (module `moderation`, ADR-005), écrits par `CreateReport` (T12), traités depuis le
 * backoffice (T15). Pas de clé étrangère polymorphe (ADR-007) : une colonne par type de cible et un
 * `CHECK` « exactement une ». `story_id` et `message_id` n'ont pas encore de clé étrangère : les tables
 * `stories` et `messages` arrivent en P1, avec leur contrainte.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id'),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id'),
    reason: text('reason', { enum: REPORT_REASONS }).notNull(),
    details: text('details'),
    status: text('status', { enum: REPORT_STATUSES }).notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, precision: 3 }),
    resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (table) => [
    // File des signalements par statut, du plus récent au plus ancien (backoffice, T15).
    index('reports_status_created_idx').on(table.status, table.createdAt.desc(), table.id.desc()),
    check(
      'reports_exactly_one_target',
      sql`num_nonnulls(${table.postId}, ${table.commentId}, ${table.storyId}, ${table.userId}, ${table.messageId}) = 1`,
    ),
    check(
      'reports_reason',
      sql`${table.reason} IN ('spam', 'nudity', 'harassment', 'violence', 'hate', 'other')`,
    ),
    check(
      'reports_status',
      sql`${table.status} IN ('open', 'resolved_removed', 'resolved_dismissed')`,
    ),
    check('reports_details_length', sql`char_length(${table.details}) BETWEEN 1 AND 500`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;

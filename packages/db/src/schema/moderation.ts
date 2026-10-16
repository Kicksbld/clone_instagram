import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
 * backoffice (T15) : tous les signalements ouverts d'une même cible prennent le même statut. Pas de clé étrangère polymorphe (ADR-007) : une colonne par type de cible et un
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
    // Identifiant Supabase Auth de l'admin, sans clé étrangère : un admin n'a pas forcément de profil.
    resolvedBy: uuid('resolved_by'),
    resolutionNote: text('resolution_note'),
  },
  (table) => [
    // File des signalements par statut, du plus récent au plus ancien (backoffice, T15).
    index('reports_status_created_idx').on(table.status, table.createdAt.desc(), table.id.desc()),
    // Signalements ouverts d'une même cible, traités ensemble (T15).
    index('reports_open_post_idx')
      .on(table.postId)
      .where(sql`${table.status} = 'open'`),
    index('reports_open_comment_idx')
      .on(table.commentId)
      .where(sql`${table.status} = 'open'`),
    index('reports_open_user_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'open'`),
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
    check(
      'reports_resolution_note_length',
      sql`char_length(${table.resolutionNote}) BETWEEN 1 AND 500`,
    ),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;

export const ADMIN_AUDIT_ACTIONS = [
  'user_suspended',
  'user_banned',
  'user_reactivated',
  'user_deleted',
  'post_removed',
  'comment_removed',
  'reports_dismissed',
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export const ADMIN_AUDIT_TARGET_TYPES = ['user', 'post', 'comment'] as const;
export type AdminAuditTargetType = (typeof ADMIN_AUDIT_TARGET_TYPES)[number];

/**
 * Journal des actions d'administration (module `moderation`, ADR-011), écrit par l'API dans la
 * transaction de chaque action qui modifie des données. Écriture seule : un trigger refuse `UPDATE` et
 * `DELETE` (migration `0010_admin`). Sans clé étrangère : l'admin n'a pas forcément de profil, et la
 * cible peut avoir été purgée depuis (le journal garde alors son seul identifiant).
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey(),
    adminId: uuid('admin_id').notNull(),
    action: text('action', { enum: ADMIN_AUDIT_ACTIONS }).notNull(),
    targetType: text('target_type', { enum: ADMIN_AUDIT_TARGET_TYPES }).notNull(),
    targetId: uuid('target_id').notNull(),
    // Motif et statuts avant / après ; jamais de donnée personnelle de la cible.
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index('admin_audit_log_target_idx').on(
      table.targetType,
      table.targetId,
      table.createdAt.desc(),
    ),
    check(
      'admin_audit_log_action',
      sql`${table.action} IN ('user_suspended', 'user_banned', 'user_reactivated', 'user_deleted', 'post_removed', 'comment_removed', 'reports_dismissed')`,
    ),
    check('admin_audit_log_target_type', sql`${table.targetType} IN ('user', 'post', 'comment')`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogRow = typeof adminAuditLog.$inferInsert;

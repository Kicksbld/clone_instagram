import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles.ts';

/**
 * Abonnements (module `social`, ADR-005) : `follower_id` suit `followee_id`. Lus par la politique de
 * visibilité (ADR-006) ; écrits à partir de T5, compteurs de `profiles` dans la même transaction.
 */
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'follows_pkey', columns: [table.followerId, table.followeeId] }),
    // Abonnés d'un compte (ADR-007).
    index('follows_followee_id_idx').on(table.followeeId),
    // On ne peut pas se suivre soi-même (ADR-006).
    check('follows_not_self', sql`${table.followerId} <> ${table.followeeId}`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

/**
 * Blocages (module `social`) : `blocker_id` bloque `blocked_id`. Les deux comptes deviennent
 * mutuellement invisibles (ADR-006) ; écrits à partir de T12.
 */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'blocks_pkey', columns: [table.blockerId, table.blockedId] }),
    // Blocages dans l'autre sens, lus par la politique de visibilité (ADR-007).
    index('blocks_blocked_id_idx').on(table.blockedId),
    // On ne peut pas se bloquer soi-même (ADR-006).
    check('blocks_not_self', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

/**
 * Demandes d'abonnement (module `social`, T20) : `requester_id` demande à suivre le compte privé
 * `target_id`. Aucun accès aux contenus tant qu'elle n'est pas acceptée (ADR-006).
 */
export const followRequests = pgTable(
  'follow_requests',
  {
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'follow_requests_pkey', columns: [table.requesterId, table.targetId] }),
    // Demandes reçues, la plus récente en premier (curseur `(created_at, requester_id)`).
    index('follow_requests_target_created_idx').on(table.targetId, table.createdAt.desc()),
    // On ne peut pas se demander soi-même (ADR-006).
    check('follow_requests_not_self', sql`${table.requesterId} <> ${table.targetId}`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type FollowRow = typeof follows.$inferSelect;
export type BlockRow = typeof blocks.$inferSelect;
export type FollowRequestRow = typeof followRequests.$inferSelect;

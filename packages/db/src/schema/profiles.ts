import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Profil d'un utilisateur (module `identity`, ADR-005). `id` = identifiant Supabase Auth, sans clé
 * étrangère vers le schéma `auth` (ADR-004) ; profil créé par `POST /v1/me/onboarding` (ADR-018).
 * `avatar_media_id` : clé étrangère vers `media` en T3.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    fullName: text('full_name').notNull(),
    bio: text('bio').notNull().default(''),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    avatarMediaId: uuid('avatar_media_id'),
    isPrivate: boolean('is_private').notNull().default(false),
    status: text('status', { enum: ['active', 'suspended', 'banned'] })
      .notNull()
      .default('active'),
    followerCount: integer('follower_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('profiles_username_key').on(table.username),
    // Règles d'ADR-007 et d'ADR-018, aussi vérifiées par le contrat et le domaine.
    check('profiles_username_format', sql`${table.username} ~ '^[a-z0-9._]{1,30}$'`),
    check(
      'profiles_full_name_length',
      sql`char_length(${table.fullName}) BETWEEN 1 AND 30 AND ${table.fullName} ~ '\\S'`,
    ),
    check('profiles_bio_length', sql`char_length(${table.bio}) <= 150`),
    check('profiles_status', sql`${table.status} IN ('active', 'suspended', 'banned')`),
    check(
      'profiles_counts_positive',
      sql`${table.followerCount} >= 0 AND ${table.followingCount} >= 0 AND ${table.postCount} >= 0`,
    ),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

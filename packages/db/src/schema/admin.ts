import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ADMIN_ROLES = ['admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Rôles d'administration (module `identity`, ADR-005), lus par chaque use case d'administration
 * (ADR-011). `user_id` = identifiant Supabase Auth, sans clé étrangère : un admin n'a pas besoin de
 * profil. Écrits uniquement par le script `pnpm admin:create` (T14).
 */
export const adminRoles = pgTable(
  'admin_roles',
  {
    userId: uuid('user_id').notNull(),
    role: text('role', { enum: ADMIN_ROLES }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'admin_roles_pkey', columns: [table.userId, table.role] }),
    check('admin_roles_role', sql`${table.role} IN ('admin')`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type AdminRoleRow = typeof adminRoles.$inferSelect;

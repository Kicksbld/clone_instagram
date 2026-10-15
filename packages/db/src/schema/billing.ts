import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles.ts';

export const SUBSCRIPTION_STATUSES = ['active', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Abonnement Clone Plus (module `billing`, ADR-012) : copie locale de l'état RevenueCat, écrite
 * uniquement par `RefreshSubscription`. Pas de ligne tant que l'utilisateur n'a jamais été abonné.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    entitlement: text('entitlement', { enum: ['plus'] })
      .notNull()
      .default('plus'),
    status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull(),
    // Identifiant du produit dans le store (`…plus.monthly`), tel que RevenueCat le renvoie.
    productId: text('product_id').notNull(),
    // Fin de la période payée ; `null` si RevenueCat n'en donne pas (abonnement en pause).
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true, precision: 3 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    check('subscriptions_entitlement', sql`${table.entitlement} = 'plus'`),
    check('subscriptions_status', sql`${table.status} IN ('active', 'expired')`),
  ],
).enableRLS(); // RLS sans policy : refus total hors de l'API (ADR-004).

export type SubscriptionRow = typeof subscriptions.$inferSelect;

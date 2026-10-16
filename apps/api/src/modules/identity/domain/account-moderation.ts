import type { AdminAuditAction } from '../../../shared/domain/admin.ts';
import type { AccountStatus } from './profile.ts';

/** Actions d'administration sur le statut d'un compte (backoffice, T14). */
export type ModerationAction = 'suspend' | 'ban' | 'reactivate';

/** Statut d'un compte vu par un admin : un compte `deleted` est introuvable. */
export type ModeratedStatus = Exclude<AccountStatus, 'deleted'>;

export interface StatusTransition {
  from: readonly ModeratedStatus[];
  to: ModeratedStatus;
  audit: AdminAuditAction;
}

/**
 * Transitions permises : suspendre un compte actif ; bannir un compte actif ou suspendu ; réactiver un
 * compte suspendu ou banni. Toute autre → `409 invalid_status_transition`. En P0, suspendu et banni ont
 * le même effet (ADR-005).
 */
export const STATUS_TRANSITIONS: Readonly<Record<ModerationAction, StatusTransition>> = {
  suspend: { from: ['active'], to: 'suspended', audit: 'user_suspended' },
  ban: { from: ['active', 'suspended'], to: 'banned', audit: 'user_banned' },
  reactivate: { from: ['suspended', 'banned'], to: 'active', audit: 'user_reactivated' },
};

export function canTransition(action: ModerationAction, status: AccountStatus): boolean {
  return (STATUS_TRANSITIONS[action].from as readonly AccountStatus[]).includes(status);
}

/** Motif saisi par l'admin, sans espaces superflus (le contrat garantit 1 à 500 caractères). */
export function normalizeAdminReason(raw: string): string {
  return raw.trim();
}

/** Longueur maximale d'un username et d'un nom (ADR-007) : au-delà, aucun compte ne correspond. */
const MAX_QUERY_LENGTH = 30;

/**
 * Recherche d'un admin : espaces en début et en fin, `@` initial, minuscules. `null` = aucun filtre
 * (vide) ; `undefined` = rien ne peut correspondre (trop long).
 */
export function normalizeAdminSearch(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return null;
  const query = raw.trim().replace(/^@+/, '').trim().toLowerCase();
  if (query.length === 0) return null;
  return query.length > MAX_QUERY_LENGTH ? undefined : query;
}

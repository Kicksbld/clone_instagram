import { ForbiddenError } from './errors.ts';

/** Rôle d'administration ; seul `admin` existe en P0 (ADR-011). */
export type AdminRole = 'admin';

/** Route d'administration appelée par un compte sans rôle `admin` (ADR-011). */
export class AdminRequiredError extends ForbiddenError {
  constructor() {
    super('admin_required', 'Rôle administrateur requis.');
  }
}

export type AdminAuditAction =
  | 'user_suspended'
  | 'user_banned'
  | 'user_reactivated'
  | 'user_deleted'
  | 'post_removed'
  | 'comment_removed'
  | 'reports_dismissed';

/** Cible d'une action d'administration : un compte (T14), un post ou un commentaire (T15). */
export type AdminAuditTargetType = 'user' | 'post' | 'comment';

/** Action d'administration écrite dans le journal d'audit, jamais modifiée (ADR-011). */
export interface AdminAuditEntry {
  adminId: string;
  action: AdminAuditAction;
  target: { type: AdminAuditTargetType; id: string };
  /**
   * Motif saisi par l'admin et statuts avant / après (compte), ou signalements traités et note
   * (modération) ; jamais de donnée personnelle de la cible.
   */
  metadata: {
    reason?: string;
    fromStatus?: string;
    toStatus?: string;
    reportIds?: string[];
    note?: string;
  };
}

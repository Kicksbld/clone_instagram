/** Types de cible signalables en P0 (stories et messages en P1). */
export type ReportTargetType = 'post' | 'comment' | 'user';

export type ReportReason = 'spam' | 'nudity' | 'harassment' | 'violence' | 'hate' | 'other';

export const REPORT_DETAILS_MAX_LENGTH = 500;

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
}

/** Signalement à enregistrer, au statut `open`. */
export interface NewReport {
  id: string;
  reporterId: string;
  target: ReportTarget;
  reason: ReportReason;
  details: string | null;
}

/** Précisions sans espaces en début ni en fin ; vides, elles sont ignorées. */
export function normalizeDetails(details: string | undefined): string | null {
  const trimmed = details?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export type ReportStatus = 'open' | 'resolved_removed' | 'resolved_dismissed';

/** Traitement d'un signalement au backoffice (T15). */
export type ResolutionAction = 'remove_content' | 'dismiss';

export const RESOLUTION_NOTE_MAX_LENGTH = 500;

/** Statut final des signalements traités par `action`. */
export function resolvedStatus(action: ResolutionAction): Exclude<ReportStatus, 'open'> {
  return action === 'remove_content' ? 'resolved_removed' : 'resolved_dismissed';
}

/**
 * Seuls un post ou un commentaire se suppriment ; un compte signalé ne peut être que classé, la
 * sanction passe par la fiche du compte (suspendre, bannir, supprimer).
 */
export function canResolve(action: ResolutionAction, target: ReportTarget): boolean {
  return action === 'dismiss' || target.type !== 'user';
}

/** Note de l'admin sans espaces en début ni en fin ; vide, elle est ignorée. */
export const normalizeNote = normalizeDetails;

/** Signalement vu par un admin. */
export interface AdminReport {
  id: string;
  target: ReportTarget;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reporter: { id: string; username: string };
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

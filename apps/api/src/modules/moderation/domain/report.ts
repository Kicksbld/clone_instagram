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

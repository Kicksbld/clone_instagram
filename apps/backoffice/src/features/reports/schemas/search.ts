import { z } from 'zod';

export const REPORT_STATUSES = ['open', 'resolved_removed', 'resolved_dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_REASONS = [
  'spam',
  'nudity',
  'harassment',
  'violence',
  'hate',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGET_TYPES = ['post', 'comment', 'user'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/**
 * Filtres de la file dans l'URL (`?status=&reason=&targetType=&cursor=`, ADR-011) ; une valeur
 * invalide est ignorée. Sans `status`, l'API renvoie les signalements ouverts.
 */
export interface ReportSearch {
  status?: ReportStatus;
  reason?: ReportReason;
  targetType?: ReportTargetType;
  cursor?: string;
}

const searchSchema = z.object({
  status: z.enum(REPORT_STATUSES).optional().catch(undefined),
  reason: z.enum(REPORT_REASONS).optional().catch(undefined),
  targetType: z.enum(REPORT_TARGET_TYPES).optional().catch(undefined),
  cursor: z.string().trim().min(1).max(128).optional().catch(undefined),
});

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseReportSearch(params: RawSearchParams): ReportSearch {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const parsed = searchSchema.parse({
    status: first(params['status']),
    reason: first(params['reason']),
    targetType: first(params['targetType']),
    cursor: first(params['cursor']),
  });
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
}

/** URL de la file avec ces critères (liens de pagination, filtres). */
export function reportsHref(search: ReportSearch): string {
  const params = new URLSearchParams();
  if (search.status) params.set('status', search.status);
  if (search.reason) params.set('reason', search.reason);
  if (search.targetType) params.set('targetType', search.targetType);
  if (search.cursor) params.set('cursor', search.cursor);
  const query = params.toString();
  return query ? `/reports?${query}` : '/reports';
}

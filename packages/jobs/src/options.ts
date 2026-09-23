/**
 * Options communes des jobs (ADR-008, ADR-015) : 3 tentatives, délai croissant (5 s puis 10 s).
 * Typées localement : packages/jobs ne dépend pas de BullMQ.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
} as const;

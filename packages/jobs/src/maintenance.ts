import { QUEUE_NAMES } from './queues.ts';

/**
 * `purge-orphan-media` (file `maintenance`, T3) : sans payload, répété toutes les heures ; efface
 * les médias jamais attachés après 24 h et les médias détachés (ADR-008).
 */
export const PURGE_ORPHAN_MEDIA = {
  queue: QUEUE_NAMES.maintenance,
  name: 'purge-orphan-media',
  everyMs: 60 * 60 * 1000,
} as const;

import { z } from 'zod';

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

/**
 * `purge-account` (file `maintenance`, T13) : à la demande, après `DELETE /v1/me`. Efface les fichiers
 * et les données d'un compte `deleted`, puis son client RevenueCat (ADR-012) et sa personne PostHog
 * (ADR-013). Chaque étape est idempotente : le job se rejoue sans erreur.
 */
export const PURGE_ACCOUNT = {
  queue: QUEUE_NAMES.maintenance,
  name: 'purge-account',
  payload: z.object({ profileId: z.uuid() }),
} as const;

export type PurgeAccountPayload = z.infer<typeof PURGE_ACCOUNT.payload>;

/** Identifiant BullMQ d'une purge : un compte n'est jamais purgé deux fois en parallèle. */
export function purgeAccountJobId(profileId: string): string {
  return `${PURGE_ACCOUNT.name}-${profileId}`;
}

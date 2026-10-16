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

/**
 * `purge-content-files` (file `maintenance`, T15) : à la demande, après la suppression d'un post par
 * modération. Efface tout de suite les fichiers et les lignes de ses médias détachés, sans attendre
 * `purge-orphan-media` (ADR-008). Idempotent : sans média restant, le job n'a aucun effet.
 */
export const PURGE_CONTENT_FILES = {
  queue: QUEUE_NAMES.maintenance,
  name: 'purge-content-files',
  payload: z.object({ postId: z.uuid() }),
} as const;

export type PurgeContentFilesPayload = z.infer<typeof PURGE_CONTENT_FILES.payload>;

/** Identifiant BullMQ d'une purge : les fichiers d'un post ne sont jamais purgés deux fois en parallèle. */
export function purgeContentFilesJobId(postId: string): string {
  return `${PURGE_CONTENT_FILES.name}-${postId}`;
}

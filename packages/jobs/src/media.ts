import { z } from 'zod';

import { QUEUE_NAMES } from './queues.ts';

/** `process-image` (file `media`, T3) : revalide l'image, génère ses variantes WebP sans EXIF (ADR-008). */
export const PROCESS_IMAGE = {
  queue: QUEUE_NAMES.media,
  name: 'process-image',
  payload: z.object({ mediaId: z.uuid() }),
  result: z.object({ mediaId: z.uuid(), ownerId: z.uuid() }),
} as const;

export type ProcessImagePayload = z.infer<typeof PROCESS_IMAGE.payload>;
export type ProcessImageResult = z.infer<typeof PROCESS_IMAGE.result>;

/** Identifiant BullMQ d'un traitement : un même média n'est jamais traité deux fois en parallèle. */
export function processImageJobId(mediaId: string): string {
  return `${PROCESS_IMAGE.name}-${mediaId}`;
}

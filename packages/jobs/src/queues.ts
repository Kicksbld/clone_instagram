/** Noms des files BullMQ partagés par l'API et le worker (ADR-015). `push` arrive en P2. */
export const QUEUE_NAMES = {
  media: 'media',
  video: 'media-video',
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Notifications only; REST remains the source of truth (ADR-021). */
export type RealtimeEvent =
  | { type: 'activity.created'; data: { unreadCount: number } }
  | {
      type: 'media.ready';
      data: { mediaId: string; variants: { thumb: string; medium: string; large: string } };
    }
  | {
      type: 'media.failed';
      data: { mediaId: string; reason: 'invalid_image' | 'file_too_large' | 'processing_error' };
    };
export interface RealtimePublisher {
  publish(userIds: string[], event: RealtimeEvent): void;
  disconnect(userId: string, code: 4401 | 4403): void;
}

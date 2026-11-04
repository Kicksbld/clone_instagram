/** Notifications only; REST remains the source of truth (ADR-021). */
export type RealtimeEvent =
  | {
      type: 'message.created';
      data: {
        id: string;
        conversationId: string;
        senderId: string;
        clientId: string;
        kind: 'text' | 'image';
        body: string;
        mediaId?: string;
        createdAt: string;
      };
    }
  | {
      type: 'conversation.read';
      data: { conversationId: string; userId: string; lastReadMessageId: string };
    }
  | { type: 'activity.created'; data: { unreadCount: number } }
  | {
      type: 'media.ready';
      data: {
        mediaId: string;
        /** Absent for a message photo, read through a signed URL (ADR-023). */
        variants?:
          { thumb: string; medium: string; large: string } | { hls: string; thumbnail: string };
      };
    }
  | {
      type: 'media.failed';
      data: {
        mediaId: string;
        reason:
          | 'invalid_image'
          | 'file_too_large'
          | 'processing_error'
          | 'invalid_video'
          | 'video_too_long';
      };
    };
export interface RealtimePublisher {
  publish(userIds: string[], event: RealtimeEvent): void;
  disconnect(userId: string, code: 4401 | 4403): void;
}

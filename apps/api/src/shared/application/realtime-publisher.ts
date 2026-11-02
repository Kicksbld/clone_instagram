/** Notifications only; REST remains the source of truth (ADR-021). */
export type RealtimeEvent = { type: 'activity.created'; data: { unreadCount: number } };
export interface RealtimePublisher {
  publish(userIds: string[], event: RealtimeEvent): void;
  disconnect(userId: string, code: 4401 | 4403): void;
}

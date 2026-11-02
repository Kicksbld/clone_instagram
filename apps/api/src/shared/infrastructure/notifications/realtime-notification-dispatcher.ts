import type { NotificationDispatcher } from '../../application/notification-dispatcher.ts';
import type { RealtimePublisher } from '../../application/realtime-publisher.ts';
import type { CreatedNotification } from '../../domain/notification.ts';

/** Runs only after commit. Failures never turn a committed REST write into a failed request. */
export class RealtimeNotificationDispatcher implements NotificationDispatcher {
  private readonly pending = new Map<string, Promise<void>>();
  constructor(
    private readonly activity: { countUnread(recipientId: string): Promise<number> },
    private readonly realtime: RealtimePublisher,
    private readonly onError: (error: unknown) => void,
  ) {}
  dispatch(notifications: CreatedNotification[]): void {
    for (const recipientId of new Set(
      notifications.map((notification) => notification.recipientId),
    )) {
      const previous = this.pending.get(recipientId) ?? Promise.resolve();
      const next = previous
        .then(async () => {
          const unreadCount = await this.activity.countUnread(recipientId);
          this.realtime.publish([recipientId], { type: 'activity.created', data: { unreadCount } });
        })
        .catch(this.onError);
      this.pending.set(recipientId, next);
      void next.then(() => {
        if (this.pending.get(recipientId) === next) this.pending.delete(recipientId);
      });
    }
  }
}

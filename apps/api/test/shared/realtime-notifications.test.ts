import { expect, test } from 'vitest';
import { RealtimeNotificationDispatcher } from '../../src/shared/infrastructure/notifications/realtime-notification-dispatcher.ts';

test('dispatch reads visible unread groups and isolates recipients; errors never escape', async () => {
  const events: unknown[] = [];
  const errors: unknown[] = [];
  const dispatcher = new RealtimeNotificationDispatcher(
    {
      countUnread: (id: string) =>
        id === 'failed' ? Promise.reject(new Error('offline')) : Promise.resolve(4),
    },
    {
      publish: (ids, event) => {
        events.push({ ids, event });
      },
      disconnect: () => undefined,
    },
    (error) => errors.push(error),
  );
  const follow = { id: 'notification', actorId: 'bob', type: 'follow' as const };
  dispatcher.dispatch([
    { ...follow, recipientId: 'alice' },
    { ...follow, recipientId: 'failed' },
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(events).toEqual([
    { ids: ['alice'], event: { type: 'activity.created', data: { unreadCount: 4 } } },
  ]);
  expect(errors).toHaveLength(1);
});

test('concurrent notifications cannot publish an older count after a newer count', async () => {
  const reads: ((count: number) => void)[] = [];
  const counts: number[] = [];
  const dispatcher = new RealtimeNotificationDispatcher(
    { countUnread: () => new Promise<number>((resolve) => reads.push(resolve)) },
    {
      publish: (_ids, event) => {
        if (event.type === 'activity.created') counts.push(event.data.unreadCount);
      },
      disconnect: () => undefined,
    },
    () => undefined,
  );
  const notification = { id: 'one', actorId: 'bob', recipientId: 'alice', type: 'follow' as const };
  dispatcher.dispatch([notification]);
  dispatcher.dispatch([{ ...notification, id: 'two' }]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(reads).toHaveLength(1);
  reads[0]?.(1);
  await new Promise((resolve) => setImmediate(resolve));
  reads[1]?.(2);
  await new Promise((resolve) => setImmediate(resolve));
  expect(counts).toEqual([1, 2]);
});

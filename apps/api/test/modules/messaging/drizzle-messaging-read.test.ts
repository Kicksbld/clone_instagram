import { blocks, newId, profiles } from '@clone/db';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { DrizzleMediaRepository } from '../../../src/modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { DrizzleMessagingRepository } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-messaging-repository.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { GetOrCreateConversation } from '../../../src/modules/messaging/application/use-cases/get-or-create-conversation.ts';
import { SendMessage } from '../../../src/modules/messaging/application/use-cases/send-message.ts';
import { MarkConversationRead } from '../../../src/modules/messaging/application/use-cases/mark-conversation-read.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const ids = [newId(), newId(), newId()];
afterAll(async () => {
  await database.db.delete(profiles).where(inArray(profiles.id, ids));
  await database.close();
});
it('counts unread messages per conversation, hides blocked ones from the badge, and only moves the read position forward', async () => {
  await database.db.insert(profiles).values(
    ids.map((id, i) => ({
      id,
      username: `r_${id.slice(-12)}_${i}`,
      fullName: 'Test',
      birthDate: '2000-01-01',
    })),
  );
  const [a, b, c] = ids as [string, string, string];
  const transaction = new DrizzleUnitOfWork(database.db, (tx) => ({
    repository: new DrizzleMessagingRepository(tx),
    relationships: new DrizzleRelationshipReader(tx),
    media: new DrizzleMediaRepository(tx),
  }));
  let tick = Date.parse('2026-11-01T12:00:00.000Z');
  const clock = { now: () => new Date((tick += 1000)) };
  const published: unknown[] = [];
  const realtime = {
    publish: (...args: unknown[]) => {
      published.push(args);
    },
    disconnect: () => {},
  };
  const create = new GetOrCreateConversation(transaction, { next: newId }, clock);
  const send = new SendMessage(transaction, { next: newId }, clock, realtime);
  const markRead = new MarkConversationRead(transaction, realtime);
  const withB = (await create.execute({ viewerId: a, userId: b })).conversation.id;
  const withC = (await create.execute({ viewerId: c, userId: b })).conversation.id;
  const say = async (viewerId: string, conversationId: string, body: string) =>
    (
      await send.execute({
        viewerId,
        conversationId,
        clientId: newId(),
        content: { kind: 'text', body },
      })
    ).message;
  const first = await say(a, withB, 'Un');
  const second = await say(a, withB, 'Deux');
  await say(b, withB, 'Réponse');
  await say(c, withC, 'Salut');
  const repository = new DrizzleMessagingRepository(database.db);
  const unreadOf = async (viewerId: string) =>
    Object.fromEntries(
      (await repository.listConversations(viewerId, null)).items.map((x) => [x.id, x.unreadCount]),
    );
  expect(await unreadOf(b)).toEqual({ [withB]: 2, [withC]: 1 });
  expect(await unreadOf(a)).toEqual({ [withB]: 1 });
  expect(await repository.unreadConversationCount(b)).toBe(2);

  published.length = 0;
  // Concurrent reads of an older and a newer message end on the newer one.
  await Promise.all([
    markRead.execute({ viewerId: b, conversationId: withB, messageId: first.id }),
    markRead.execute({ viewerId: b, conversationId: withB, messageId: second.id }),
  ]);
  await markRead.execute({ viewerId: b, conversationId: withB, messageId: first.id });
  const seen = (await repository.listConversations(a, null)).items[0];
  expect(seen?.otherMemberLastReadMessageId).toBe(second.id);
  expect(published.at(-1)).toEqual([
    [a],
    {
      type: 'conversation.read',
      data: { conversationId: withB, userId: b, lastReadMessageId: second.id },
    },
  ]);
  expect(published.length).toBeLessThanOrEqual(2);
  expect(await unreadOf(b)).toEqual({ [withB]: 0, [withC]: 1 });
  expect(await repository.unreadConversationCount(b)).toBe(1);

  // A rolled-back read never announces « Vu ».
  const reply = await say(a, withB, 'Encore');
  published.length = 0;
  const failing = new MarkConversationRead(
    {
      run: (work) =>
        transaction.run(async (scope) => {
          await work(scope);
          throw new Error('rollback');
        }),
    },
    realtime,
  );
  await expect(
    failing.execute({ viewerId: b, conversationId: withB, messageId: reply.id }),
  ).rejects.toThrow('rollback');
  expect(published).toEqual([]);
  expect(await unreadOf(b)).toEqual({ [withB]: 1, [withC]: 1 });

  await database.db.insert(blocks).values({ blockerId: c, blockedId: b });
  expect(await repository.unreadConversationCount(b)).toBe(1);
});

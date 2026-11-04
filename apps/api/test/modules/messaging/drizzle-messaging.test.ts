import { blocks, newId, profiles } from '@clone/db';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { DrizzleMediaRepository } from '../../../src/modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { DrizzleMessagingRepository } from '../../../src/modules/messaging/infrastructure/persistence/drizzle-messaging-repository.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { GetOrCreateConversation } from '../../../src/modules/messaging/application/use-cases/get-or-create-conversation.ts';
import { SendMessage } from '../../../src/modules/messaging/application/use-cases/send-message.ts';
import { ListMessages } from '../../../src/modules/messaging/application/use-cases/list-messages.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const ids = [newId(), newId()];
afterAll(async () => {
  await database.db.delete(profiles).where(inArray(profiles.id, ids));
  await database.close();
});
it('concurrent opens share one conversation; duplicate sends commit and publish only once', async () => {
  await database.db.insert(profiles).values(
    ids.map((id, i) => ({
      id,
      username: `m_${id.slice(-12)}_${i}`,
      fullName: 'Test',
      birthDate: '2000-01-01',
      isPrivate: true,
    })),
  );
  const transaction = new DrizzleUnitOfWork(database.db, (tx) => ({
    repository: new DrizzleMessagingRepository(tx),
    relationships: new DrizzleRelationshipReader(tx),
    media: new DrizzleMediaRepository(tx),
  }));
  const clock = { now: () => new Date('2026-11-01T12:00:00.123Z') };
  const create = new GetOrCreateConversation(transaction, { next: newId }, clock);
  const [a, b] = ids as [string, string];
  const opened = await Promise.all([
    create.execute({ viewerId: a, userId: b }),
    create.execute({ viewerId: b, userId: a }),
  ]);
  expect(opened[0].conversation.id).toBe(opened[1].conversation.id);
  expect(opened.map((x) => x.created).sort()).toEqual([false, true]);
  const repository = new DrizzleMessagingRepository(database.db);
  expect((await repository.listConversations(a, null)).items).toEqual([]);
  const published: unknown[] = [];
  const send = new SendMessage(transaction, { next: newId }, clock, {
    publish: (...args) => {
      published.push(args);
    },
    disconnect: () => {},
  });
  const input = {
    viewerId: a,
    conversationId: opened[0].conversation.id,
    clientId: newId(),
    content: { kind: 'text' as const, body: 'Bonjour' },
  };
  const results = await Promise.all([send.execute(input), send.execute(input)]);
  expect(results[0].message.id).toBe(results[1].message.id);
  expect(published).toHaveLength(1);
  const history = new ListMessages(repository, new DrizzleRelationshipReader(database.db));
  expect(
    (
      await history.execute({ viewerId: b, conversationId: input.conversationId, cursor: null })
    ).items.map((x) => x.body),
  ).toEqual(['Bonjour']);
  expect((await repository.listConversations(b, null)).items[0]?.lastMessage?.body).toBe('Bonjour');
  // A rolled-back send must never announce a message that REST cannot retrieve.
  const failedSend = new SendMessage(
    {
      run: (work) =>
        transaction.run(async (scope) => {
          await work(scope);
          throw new Error('rollback');
        }),
    },
    { next: newId },
    clock,
    {
      publish: (...args) => {
        published.push(args);
      },
      disconnect: () => {},
    },
  );
  await expect(
    failedSend.execute({
      ...input,
      clientId: newId(),
      content: { kind: 'text', body: 'Annulé' },
    }),
  ).rejects.toThrow('rollback');
  expect(published).toHaveLength(1);
  expect(
    (await history.execute({ viewerId: a, conversationId: input.conversationId, cursor: null }))
      .items,
  ).toHaveLength(1);

  const anchor = results[0].message;
  for (let i = 0; i < 131; i++)
    await send.execute({
      ...input,
      clientId: newId(),
      content: { kind: 'text', body: `Message ${i}` },
    });
  const newest = await history.execute({
    viewerId: a,
    conversationId: input.conversationId,
    cursor: null,
  });
  expect(newest.items).toHaveLength(30);
  const older = await history.execute({
    viewerId: a,
    conversationId: input.conversationId,
    cursor: newest.next,
  });
  expect(older.items).toHaveLength(30);
  expect(new Set([...newest.items, ...older.items].map((m) => m.id)).size).toBe(60);
  const catchup = await history.execute({
    viewerId: b,
    conversationId: input.conversationId,
    cursor: null,
    after: anchor.id,
  });
  expect(catchup.items).toHaveLength(100);
  expect(catchup.items[0]?.body).toBe('Message 0');
  const remaining = await history.execute({
    viewerId: b,
    conversationId: input.conversationId,
    cursor: catchup.next,
    after: anchor.id,
  });
  expect(remaining.items).toHaveLength(31);
  expect(remaining.items.at(-1)?.body).toBe('Message 130');
  expect(remaining.next).toBeNull();

  await database.db.insert(blocks).values({ blockerId: b, blockedId: a });
  expect((await repository.listConversations(a, null)).items).toEqual([]);
  expect((await repository.listConversations(b, null)).items).toEqual([]);
  await expect(
    history.execute({ viewerId: a, conversationId: input.conversationId, cursor: null }),
  ).rejects.toMatchObject({ code: 'conversation_not_found' });
  await database.db.delete(blocks).where(and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)));
  expect((await repository.listConversations(a, null)).items).toHaveLength(1);
  await database.db.update(profiles).set({ status: 'suspended' }).where(eq(profiles.id, b));
  expect((await repository.listConversations(a, null)).items).toEqual([]);
});

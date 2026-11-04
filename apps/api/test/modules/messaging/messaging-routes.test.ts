import { once } from 'node:events';
import type { components } from '@clone/contract';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';
const A = '0199a1b2-0000-7000-8000-000000000001';
const B = '0199a1b2-0000-7000-8000-000000000002';
const C = '0199a1b2-0000-7000-8000-000000000003';
let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };
beforeEach(async () => {
  context = buildTestApp();
  for (const [id, username] of [
    [A, 'alice'],
    [B, 'bob'],
    [C, 'charlie'],
  ] as const)
    context.profiles.add({ id: id, username: username, fullName: 'Test', isPrivate: true });
  auth = { authorization: `Bearer ${await signTestToken(A)}` };
});
afterEach(() => context.app.close());
const open = (userId = B) =>
  context.app.inject({
    method: 'POST',
    url: '/v1/conversations',
    headers: auth,
    payload: { userId },
  });
const history = (id: string, query = '', headers = auth) =>
  context.app.inject({ method: 'GET', url: `/v1/conversations/${id}/messages${query}`, headers });
it('opens an empty private conversation, sends idempotently, and returns a complete history', async () => {
  const created = await open();
  expect(created.statusCode).toBe(201);
  expect((await open()).statusCode).toBe(200);
  expect((await context.app.inject({ url: '/v1/conversations', headers: auth })).json()).toEqual({
    items: [],
    unreadConversationCount: 0,
  });
  const id = created.json<components['schemas']['Conversation']>().id;
  const input = {
    method: 'POST' as const,
    url: `/v1/conversations/${id}/messages`,
    headers: auth,
    payload: { clientId: C, kind: 'text', body: 'Bonjour' },
  };
  const first = await context.app.inject(input);
  expect(first.statusCode).toBe(201);
  const retry = await context.app.inject(input);
  expect(retry.statusCode).toBe(200);
  expect(retry.json()).toEqual(first.json());
  const otherAuth = { authorization: `Bearer ${await signTestToken(B)}` };
  expect((await history(id, '', otherAuth)).json()).toEqual({ items: [first.json()] });
  expect(
    (await history(id, `?after=${first.json<components['schemas']['Conversation']>().id}`)).json(),
  ).toEqual({ items: [] });
  expect((await history(id, '?cursor=broken')).json()).toMatchObject({ code: 'invalid_cursor' });
  expect((await history(id, `?after=${C}`)).json()).toMatchObject({ code: 'invalid_cursor' });
  const thirdAuth = { authorization: `Bearer ${await signTestToken(C)}` };
  expect((await history(id, '', thirdAuth)).statusCode).toBe(404);
  expect((await context.app.inject({ ...input, headers: thirdAuth })).statusCode).toBe(404);
});
it('hides blocked conversations in both directions and restores history after unblock', async () => {
  const id = (await open()).json<components['schemas']['Conversation']>().id;
  await context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/messages`,
    headers: auth,
    payload: { clientId: C, kind: 'text', body: 'Conservé' },
  });
  await context.app.inject({ method: 'PUT', url: `/v1/users/${B}/block`, headers: auth });
  expect((await history(id)).statusCode).toBe(404);
  const otherAuth = { authorization: `Bearer ${await signTestToken(B)}` };
  expect((await history(id, '', otherAuth)).statusCode).toBe(404);
  expect(
    (await context.app.inject({ url: '/v1/conversations', headers: otherAuth })).json(),
  ).toEqual({ items: [], unreadConversationCount: 0 });
  expect((await open()).statusCode).toBe(404);
  await context.app.inject({ method: 'DELETE', url: `/v1/users/${B}/block`, headers: auth });
  expect((await history(id)).json<components['schemas']['MessagePage']>().items).toHaveLength(1);
});
it('rejects self, suspended recipients, invalid text, and unknown input', async () => {
  expect((await open(A)).json()).toMatchObject({ code: 'cannot_message_self' });
  expect((await open(A.toUpperCase())).json()).toMatchObject({ code: 'cannot_message_self' });
  const id = (await open()).json<components['schemas']['Conversation']>().id;
  for (const payload of [
    { clientId: C, kind: 'text', body: '' },
    { clientId: C, kind: 'text', body: 'x'.repeat(1001) },
    { clientId: C, kind: 'text', body: 'ok', unknown: true },
  ]) {
    expect(
      (
        await context.app.inject({
          method: 'POST',
          url: `/v1/conversations/${id}/messages`,
          headers: auth,
          payload,
        })
      ).statusCode,
    ).toBe(400);
  }
  const recipient = context.profiles.rows.get(B);
  if (!recipient) throw new Error('Missing recipient');
  recipient.status = 'suspended';
  expect((await history(id)).statusCode).toBe(404);
  expect((await open()).statusCode).toBe(404);
});

it('delivers the committed REST message to both authenticated members only', async () => {
  await context.app.ready();
  const sockets = await Promise.all(
    [A, B, C].map(async (userId) => {
      const socket = await context.app.injectWS('/v1/ws');
      const ready = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'auth', token: await signTestToken(userId) }));
      await ready;
      return socket;
    }),
  );
  const [sender, recipient, stranger] = sockets;
  if (!sender || !recipient || !stranger) throw new Error('Missing socket');
  const outsiderEvents: unknown[] = [];
  stranger.on('message', (data) => {
    outsiderEvents.push(data);
  });
  const first = once(sender, 'message'),
    second = once(recipient, 'message');
  const id = (await open()).json<components['schemas']['Conversation']>().id;
  const response = await context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/messages`,
    headers: auth,
    payload: { clientId: C, kind: 'text', body: 'Temps réel' },
  });
  expect(JSON.parse(String((await first)[0]))).toEqual({
    type: 'message.created',
    data: response.json<components['schemas']['Message']>(),
  });
  expect(JSON.parse(String((await second)[0]))).toEqual({
    type: 'message.created',
    data: response.json<components['schemas']['Message']>(),
  });
  expect(outsiderEvents).toEqual([]);
  for (const socket of sockets) socket.close();
});

const send = (id: string, body: string, clientId: string, headers = auth) =>
  context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/messages`,
    headers,
    payload: { clientId, kind: 'text', body },
  });
const read = (id: string, messageId: string, headers: { authorization: string }) =>
  context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/read`,
    headers,
    payload: { messageId },
  });
const list = async (headers: { authorization: string }) =>
  (await context.app.inject({ url: '/v1/conversations', headers })).json<
    components['schemas']['ConversationPage']
  >();

it('counts unread conversations for the recipient and shows "Vu" to the sender after reading', async () => {
  await context.app.ready();
  const bob = { authorization: `Bearer ${await signTestToken(B)}` };
  const socket = await context.app.injectWS('/v1/ws');
  const ready = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: await signTestToken(A) }));
  await ready;
  const id = (await open()).json<components['schemas']['Conversation']>().id;
  await send(id, 'Un', '0199a1b2-0000-7000-8000-0000000000c1');
  const last = (await send(id, 'Deux', '0199a1b2-0000-7000-8000-0000000000c2')).json<
    components['schemas']['Message']
  >();
  const unread = await list(bob);
  expect(unread.unreadConversationCount).toBe(1);
  expect(unread.items[0]).toMatchObject({ unreadCount: 2 });
  expect(unread.items[0]?.otherMemberLastReadMessageId).toBeUndefined();
  const sender = await list(auth);
  expect(sender.unreadConversationCount).toBe(0);
  expect(sender.items[0]).toMatchObject({ unreadCount: 0 });
  expect(sender.items[0]?.otherMemberLastReadMessageId).toBeUndefined();

  const event = once(socket, 'message');
  expect((await read(id, last.id, bob)).statusCode).toBe(204);
  expect(JSON.parse(String((await event)[0]))).toEqual({
    type: 'conversation.read',
    data: { conversationId: id, userId: B, lastReadMessageId: last.id },
  });
  expect((await list(auth)).items[0]?.otherMemberLastReadMessageId).toBe(last.id);
  const after = await list(bob);
  expect(after.unreadConversationCount).toBe(0);
  expect(after.items[0]).toMatchObject({ unreadCount: 0 });
  socket.close();
});

it('never moves the read position backwards and publishes nothing for an older message', async () => {
  const bob = { authorization: `Bearer ${await signTestToken(B)}` };
  const id = (await open()).json<components['schemas']['Conversation']>().id;
  const first = (await send(id, 'Un', '0199a1b2-0000-7000-8000-0000000000c1')).json<
    components['schemas']['Message']
  >();
  const second = (await send(id, 'Deux', '0199a1b2-0000-7000-8000-0000000000c2')).json<
    components['schemas']['Message']
  >();
  expect((await read(id, second.id, bob)).statusCode).toBe(204);
  const published: unknown[] = [];
  const original = context.realtime.publish.bind(context.realtime);
  context.realtime.publish = (...args) => {
    published.push(args);
    original(...args);
  };
  expect((await read(id, first.id, bob)).statusCode).toBe(204);
  expect((await read(id, second.id, bob)).statusCode).toBe(204);
  expect(published).toEqual([]);
  expect((await list(auth)).items[0]?.otherMemberLastReadMessageId).toBe(second.id);
  const third = (await send(id, 'Trois', '0199a1b2-0000-7000-8000-0000000000c3')).json<
    components['schemas']['Message']
  >();
  expect((await list(bob)).items[0]).toMatchObject({ unreadCount: 1 });
  // Reading my own message is allowed and only counts the other member's messages.
  expect((await read(id, third.id, auth)).statusCode).toBe(204);
});

it('refuses reads of foreign messages, third-party and blocked conversations', async () => {
  const bob = { authorization: `Bearer ${await signTestToken(B)}` };
  const charlie = { authorization: `Bearer ${await signTestToken(C)}` };
  const id = (await open()).json<components['schemas']['Conversation']>().id;
  const message = (await send(id, 'Un', '0199a1b2-0000-7000-8000-0000000000c1')).json<
    components['schemas']['Message']
  >();
  const otherId = (await open(C)).json<components['schemas']['Conversation']>().id;
  const foreign = (await send(otherId, 'Autre', '0199a1b2-0000-7000-8000-0000000000c2')).json<
    components['schemas']['Message']
  >();
  expect((await read(id, foreign.id, bob)).json()).toMatchObject({
    code: 'conversation_not_found',
  });
  expect((await read(id, C, bob)).statusCode).toBe(404);
  expect((await read(id, message.id, charlie)).statusCode).toBe(404);
  const invalid = await context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/read`,
    headers: bob,
    payload: { messageId: message.id, extra: true },
  });
  expect(invalid.statusCode).toBe(400);
  await context.app.inject({ method: 'PUT', url: `/v1/users/${B}/block`, headers: auth });
  expect((await read(id, message.id, bob)).statusCode).toBe(404);
});

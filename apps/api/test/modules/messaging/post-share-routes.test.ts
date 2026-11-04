import type { components } from '@clone/contract';
type Message = components['schemas']['Message'];
type MessagePage = components['schemas']['MessagePage'];
type Conversation = components['schemas']['Conversation'];
type ConversationPage = components['schemas']['ConversationPage'];
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildTestApp, TEST_NOW } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';
const A = '0199a1b2-0000-7000-8000-000000000001';
const B = '0199a1b2-0000-7000-8000-000000000002';
const C = '0199a1b2-0000-7000-8000-000000000003';
const POST = '0199a1b2-0000-7000-a000-000000000001';
const CLIENT = '0199a1b2-0000-7000-b000-000000000001';
let context: ReturnType<typeof buildTestApp>;
const headers = async (id: string) => ({ authorization: `Bearer ${await signTestToken(id)}` });
beforeEach(async () => {
  context = buildTestApp();
  for (const [id, username] of [
    [A, 'alice'],
    [B, 'bob'],
    [C, 'charlie'],
  ] as const)
    context.profiles.add({ id, username, fullName: 'Test', isPrivate: true });
  await context.posts.create({
    id: POST,
    authorId: A,
    kind: 'post',
    caption: 'Secret',
    mediaIds: [],
    createdAt: TEST_NOW,
  });
});
afterEach(() => context.app.close());
async function open(userId = B) {
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/conversations',
    headers: await headers(A),
    payload: { userId },
  });
  return response.json<{ id: string }>().id;
}
async function send(id: string, viewerId = A) {
  return context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/messages`,
    headers: await headers(viewerId),
    payload: { clientId: CLIENT, kind: 'post_share', sharedPostId: POST },
  });
}
it('shares a visible post idempotently and redacts it for a recipient who cannot see it', async () => {
  const id = await open();
  const first = await send(id);
  expect(first.statusCode).toBe(201);
  expect(first.json()).toMatchObject({
    kind: 'post_share',
    body: '',
    sharedPostId: POST,
    sharedPost: { id: POST, caption: 'Secret' },
  });
  const retry = await send(id);
  expect(retry.statusCode).toBe(200);
  expect(retry.json()).toEqual(first.json());
  const history = await context.app.inject({
    url: `/v1/conversations/${id}/messages`,
    headers: await headers(B),
  });
  expect(history.json<MessagePage>().items).toEqual([
    { ...first.json<Message>(), sharedPost: null },
  ]);
  const inbox = await context.app.inject({ url: '/v1/conversations', headers: await headers(B) });
  expect(inbox.json<ConversationPage>().items[0]?.lastMessage?.sharedPost).toBeNull();
});

it('rechecks visibility after unfollow and deletion on every read and retry', async () => {
  context.relationships.follow(B, A);
  const id = await open();
  const sent = await send(id);
  const read = async () =>
    (
      await context.app.inject({
        url: `/v1/conversations/${id}/messages`,
        headers: await headers(B),
      })
    ).json<MessagePage>().items[0];
  expect((await read())?.sharedPost?.caption).toBe('Secret');
  context.relationships.unfollow(B, A);
  expect(await read()).toMatchObject({ kind: 'post_share', sharedPost: null });
  context.relationships.follow(B, A);
  await context.posts.softDelete(POST, A);
  expect(await read()).toMatchObject({ kind: 'post_share', sharedPost: null });
  const retry = await send(id);
  expect(retry.statusCode).toBe(200);
  expect(retry.json()).toMatchObject({
    id: sent.json<Message>().id,
    kind: 'post_share',
    sharedPost: null,
  });
});

it('rejects sharing a post invisible to the sender with 404 and no message', async () => {
  const id = await open();
  const response = await send(id, B);
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ code: 'post_not_found' });
  const history = await context.app.inject({
    url: `/v1/conversations/${id}/messages`,
    headers: await headers(A),
  });
  expect(history.json<MessagePage>().items).toEqual([]);
});

it('one blocked recipient does not prevent sending to another conversation', async () => {
  const b = await open(B);
  const c = await open(C);
  context.relationships.block(B, A);
  expect((await send(b)).statusCode).toBe(404);
  expect((await send(c)).statusCode).toBe(201);
});

it('redacts realtime previews independently for each member', async () => {
  await context.app.ready();
  const sockets = await Promise.all(
    [A, B].map(async (userId) => {
      const socket = await context.app.injectWS('/v1/ws');
      const ready = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'auth', token: await signTestToken(userId) }));
      await ready;
      return socket;
    }),
  );
  try {
    const events = sockets.map((socket) => once(socket, 'message'));
    await send(await open());
    const received = await Promise.all(events);
    expect(JSON.parse(String(received[0]?.[0]))).toMatchObject({
      data: { sharedPost: { caption: 'Secret' } },
    });
    expect(JSON.parse(String(received[1]?.[0]))).toMatchObject({ data: { sharedPost: null } });
  } finally {
    sockets.forEach((socket) => {
      socket.close();
    });
  }
});

it.each(['blocked', 'suspended', 'banned'] as const)(
  'hides a referenced author who becomes %s',
  async (state) => {
    await context.posts.create({
      id: POST,
      authorId: C,
      kind: 'post',
      caption: 'Secret',
      mediaIds: [],
      createdAt: TEST_NOW,
    });
    context.relationships.follow(A, C);
    context.relationships.follow(B, C);
    const id = await open();
    expect((await send(id)).statusCode).toBe(201);
    if (state === 'blocked') context.relationships.block(C, B);
    else {
      const author = context.profiles.rows.get(C);
      if (!author) throw new Error('Missing author');
      author.status = state;
    }
    const history = await context.app.inject({
      url: `/v1/conversations/${id}/messages`,
      headers: await headers(B),
    });
    expect(history.json<MessagePage>().items[0]).toMatchObject({
      kind: 'post_share',
      sharedPost: null,
    });
    const reopened = await context.app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers: await headers(B),
      payload: { userId: A },
    });
    expect(reopened.json<Conversation>().lastMessage?.sharedPost).toBeNull();
  },
);

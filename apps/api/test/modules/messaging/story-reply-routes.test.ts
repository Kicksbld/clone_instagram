import { once } from 'node:events';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildTestApp, TEST_NOW } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';
const A = '0199a1b2-0000-7000-8000-000000000001';
const B = '0199a1b2-0000-7000-8000-000000000002';
const STORY = '0199a1b2-0000-7000-a000-000000000001';
const CLIENT = '0199a1b2-0000-7000-b000-000000000001';
let context: ReturnType<typeof buildTestApp>;
const headers = async (id: string) => ({ authorization: `Bearer ${await signTestToken(id)}` });
beforeEach(async () => {
  context = buildTestApp();
  context.profiles.add({ id: A, username: 'alice', fullName: 'Alice' });
  context.profiles.add({ id: B, username: 'bob', fullName: 'Bob' });
  await context.stories.create({
    id: STORY,
    authorId: A,
    mediaId: STORY,
    audience: 'everyone',
    createdAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + 86400000),
  });
});
afterEach(() => context.app.close());
async function open() {
  return (
    await context.app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers: await headers(B),
      payload: { userId: A },
    })
  ).json<{ id: string }>().id;
}
async function send(id: string, viewerId = B) {
  return context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${id}/messages`,
    headers: await headers(viewerId),
    payload: { clientId: CLIENT, kind: 'story_reply', storyId: STORY, body: 'Bonjour !' },
  });
}
it('sends a reply once and resolves its preview again after expiration', async () => {
  const id = await open();
  const first = await send(id);
  expect(first.statusCode).toBe(201);
  expect(first.json()).toMatchObject({
    kind: 'story_reply',
    body: 'Bonjour !',
    storyId: STORY,
    sharedStory: { id: STORY },
  });
  const row = context.stories.rows.get(STORY);
  if (!row) throw new Error('Missing story');
  row.expiresAt = TEST_NOW;
  const retry = await send(id);
  expect(retry.statusCode).toBe(200);
  expect(retry.json()).toMatchObject({ id: first.json<{ id: string }>().id, sharedStory: null });
  const history = await context.app.inject({
    url: `/v1/conversations/${id}/messages`,
    headers: await headers(A),
  });
  expect(history.json<{ items: unknown[] }>().items).toMatchObject([
    { sharedStory: null, body: 'Bonjour !' },
  ]);
});
it.each(['expired', 'own', 'close_friends', 'private', 'blocked', 'suspended', 'deleted'] as const)(
  'rejects a reply to a %s story',
  async (state) => {
    const id = await open();
    const row = context.stories.rows.get(STORY);
    const owner = context.profiles.rows.get(A);
    if (!row || !owner) throw new Error('Missing fixture');
    if (state === 'expired') row.expiresAt = TEST_NOW;
    if (state === 'close_friends') row.audience = 'close_friends';
    if (state === 'private') owner.isPrivate = true;
    if (state === 'blocked') context.relationships.block(A, B);
    if (state === 'suspended') owner.status = 'suspended';
    if (state === 'deleted') row.deletedAt = TEST_NOW;
    const response = await send(id, state === 'own' ? A : B);
    expect(response.statusCode).toBe(404);
    if (state !== 'blocked' && state !== 'suspended') {
      const history = await context.app.inject({
        url: `/v1/conversations/${id}/messages`,
        headers: await headers(B),
      });
      expect(history.json<{ items: unknown[] }>().items).toEqual([]);
    }
  },
);
it('removes the preview from history and inbox after close-friend access is revoked', async () => {
  const row = context.stories.rows.get(STORY);
  if (!row) throw new Error('Missing story');
  row.audience = 'close_friends';
  context.relationships.addCloseFriend(A, B);
  const id = await open();
  expect((await send(id)).statusCode).toBe(201);
  context.relationships.removeCloseFriend(A, B);
  const history = await context.app.inject({
    url: `/v1/conversations/${id}/messages`,
    headers: await headers(B),
  });
  expect(history.json<{ items: unknown[] }>().items).toMatchObject([{ sharedStory: null }]);
  const inbox = await context.app.inject({ url: '/v1/conversations', headers: await headers(B) });
  expect(inbox.json<{ items: unknown[] }>().items).toMatchObject([
    { lastMessage: { sharedStory: null } },
  ]);
});
it('rejects a story addressed to a conversation with someone other than its author', async () => {
  const C = '0199a1b2-0000-7000-8000-000000000003';
  context.profiles.add({ id: C, username: 'charlie', fullName: 'Charlie' });
  const id = (
    await context.app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers: await headers(B),
      payload: { userId: C },
    })
  ).json<{ id: string }>().id;
  expect((await send(id)).statusCode).toBe(404);
});

it('delivers the complete story reply to the author over realtime', async () => {
  await context.app.ready();
  const socket = await context.app.injectWS('/v1/ws');
  try {
    const ready = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'auth', token: await signTestToken(A) }));
    await ready;
    const event = once(socket, 'message');
    const response = await send(await open());
    expect(response.statusCode).toBe(201);
    const received = await Promise.all([event]);
    expect(JSON.parse(String(received[0][0]))).toMatchObject({
      type: 'message.created',
      data: { kind: 'story_reply', storyId: STORY, body: 'Bonjour !', sharedStory: { id: STORY } },
    });
  } finally {
    socket.close();
  }
});

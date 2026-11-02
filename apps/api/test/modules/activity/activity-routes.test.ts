import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_MEDIA_BASE_URL } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const LEA = '0199a1b2-0000-7000-8000-000000000002';
const TOM = '0199a1b2-0000-7000-8000-000000000003';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian' });
  context.profiles.add({ id: LEA, username: 'lea' });
  context.profiles.add({ id: TOM, username: 'tom' });
});

afterEach(async () => {
  await context.app.close();
});

const as = async (userId: string) => ({
  authorization: `Bearer ${await signTestToken(userId)}`,
});
const getActivity = (query = '') =>
  context.app.inject({ method: 'GET', url: `/v1/activity${query}`, headers: auth });
const markRead = () =>
  context.app.inject({ method: 'POST', url: '/v1/activity/read', headers: auth });

let mediaCounter = 0;
/** Publie un post de `authorId` avec une image prête. */
async function givenPost(authorId: string): Promise<{ id: string; mediaId: string }> {
  const mediaId = `0199a1b2-0000-7000-c000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({ id: mediaId, ownerId: authorId, purpose: 'post' });
  const post = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers: await as(authorId),
    payload: { kind: 'post', mediaIds: [mediaId] },
  });
  expect(post.statusCode).toBe(201);
  return { id: post.json<{ id: string }>().id, mediaId };
}

const like = async (userId: string, postId: string) =>
  context.app.inject({
    method: 'PUT',
    url: `/v1/posts/${postId}/like`,
    headers: await as(userId),
  });

describe('GET /v1/activity', () => {
  it('sans notification → liste vide, unreadCount 0', async () => {
    const response = await getActivity();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], unreadCount: 0 });
  });

  it('« lea et 1 autre ont aimé votre publication » : un groupe, dernier acteur et miniature', async () => {
    const post = await givenPost(ME);
    await like(TOM, post.id);
    await like(LEA, post.id);

    const response = await getActivity();

    expect(response.statusCode).toBe(200);
    const activity = response.json<{ items: Record<string, unknown>[]; unreadCount: number }>();
    expect(activity.unreadCount).toBe(1);
    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]).toMatchObject({
      id: `like:${post.id}`,
      type: 'like',
      actor: { id: LEA, username: 'lea' },
      actorCount: 2,
      read: false,
      post: {
        id: post.id,
        thumbnail: {
          thumb: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${post.mediaId}/thumb.webp`,
        },
      },
    });
    expect(activity.items[0]?.['actor']).not.toHaveProperty('avatar');
  });

  it('commentaire et abonnement : cible du commentaire, pas de post pour un abonnement', async () => {
    const post = await givenPost(ME);
    const commented = await context.app.inject({
      method: 'POST',
      url: `/v1/posts/${post.id}/comments`,
      headers: await as(LEA),
      payload: { body: 'Superbe' },
    });
    await context.app.inject({
      method: 'PUT',
      url: `/v1/users/${ME}/follow`,
      headers: await as(TOM),
    });

    const { items } = (await getActivity()).json<{ items: Record<string, unknown>[] }>();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'follow', actor: { id: TOM, username: 'tom' } });
    expect(items[1]).toMatchObject({
      type: 'comment',
      comment: { id: commented.json<{ id: string }>().id, body: 'Superbe' },
      post: { id: post.id },
    });
    expect(items[0]).not.toHaveProperty('post');
    expect(items[0]).not.toHaveProperty('comment');
  });

  it('acteur bloqué ou suspendu : notification masquée', async () => {
    const post = await givenPost(ME);
    await like(LEA, post.id);
    await like(TOM, post.id);
    context.relationships.block(ME, LEA);
    context.profiles.add({ id: TOM, username: 'tom', status: 'suspended' });

    expect((await getActivity()).json()).toEqual({ items: [], unreadCount: 0 });
  });

  it('post supprimé : notification masquée', async () => {
    const post = await givenPost(ME);
    await like(LEA, post.id);
    await context.app.inject({ method: 'DELETE', url: `/v1/posts/${post.id}`, headers: auth });

    expect((await getActivity()).json()).toEqual({ items: [], unreadCount: 0 });
  });

  it('pages de 20 : nextCursor, puis page suivante sans doublon', async () => {
    const post = await givenPost(ME);
    const headers = await as(LEA);
    for (let index = 0; index < 21; index += 1) {
      await context.app.inject({
        method: 'POST',
        url: `/v1/posts/${post.id}/comments`,
        headers,
        payload: { body: `Commentaire ${index}` },
      });
    }

    const first = (await getActivity()).json<{ items: { id: string }[]; nextCursor: string }>();
    const second = (await getActivity(`?cursor=${first.nextCursor}`)).json<{
      items: { id: string }[];
      nextCursor?: string;
    }>();

    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    expect(first.items.map((item) => item.id)).not.toContain(second.items[0]?.id);
  });

  it('curseur invalide → 400 invalid_cursor', async () => {
    const response = await getActivity('?cursor=pas-un-curseur');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });

  it('sans authentification → 401', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/activity' });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /v1/activity/read', () => {
  it('marque tout comme lu → 204, unreadCount revient à 0 ; idempotent', async () => {
    const post = await givenPost(ME);
    await like(LEA, post.id);

    expect((await markRead()).statusCode).toBe(204);
    expect((await markRead()).statusCode).toBe(204);

    const activity = (await getActivity()).json<{
      items: { read: boolean }[];
      unreadCount: number;
    }>();
    expect(activity.unreadCount).toBe(0);
    expect(activity.items[0]?.read).toBe(true);
  });
});

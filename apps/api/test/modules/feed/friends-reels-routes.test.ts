import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const AUTHOR = '0199a1b2-0000-7000-8000-000000000002';
const PRIVATE = '0199a1b2-0000-7000-8000-000000000003';
const friendId = (n: number) => `0199a1b2-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;

let context: ReturnType<typeof buildTestApp>;

beforeEach(() => {
  context = buildTestApp();
  context.profiles.add({ id: ME, username: 'killian' });
  context.profiles.add({ id: AUTHOR, username: 'author' });
  context.profiles.add({ id: PRIVATE, username: 'prive', isPrivate: true });
});

afterEach(async () => {
  await context.app.close();
});

const as = async (userId: string) => ({ authorization: `Bearer ${await signTestToken(userId)}` });
const call = async (
  userId: string,
  method: 'GET' | 'PUT' | 'POST' | 'PATCH',
  url: string,
  payload?: object,
) => context.app.inject({ method, url, headers: await as(userId), ...(payload && { payload }) });
const friendsTab = (query = '') => call(ME, 'GET', `/v1/reels/friends${query}`);
const interactionsOf = (reel: string) => call(ME, 'GET', `/v1/reels/${reel}/friend-interactions`);

/** Abonné mutuel de ME. */
function givenFriend(n: number): string {
  const id = friendId(n);
  context.profiles.add({ id, username: `ami${n}` });
  context.relationships.follow(ME, id);
  context.relationships.follow(id, ME);
  return id;
}

let mediaCounter = 0;
async function givenPost(authorId: string, kind: 'post' | 'reel' = 'reel'): Promise<string> {
  const mediaId = `0199a1b2-0000-7000-c000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({
    id: mediaId,
    ownerId: authorId,
    purpose: 'post',
    kind: kind === 'reel' ? 'video' : 'image',
    variants:
      kind === 'reel'
        ? { hls: `${mediaId}/master.m3u8`, thumbnail: `${mediaId}/thumb.webp` }
        : { thumb: `${mediaId}/t.webp`, medium: `${mediaId}/m.webp`, large: `${mediaId}/l.webp` },
  });
  const response = await call(authorId, 'POST', '/v1/posts', { kind, mediaIds: [mediaId] });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

const like = (userId: string, postId: string) => call(userId, 'PUT', `/v1/posts/${postId}/like`);

type FriendsPage = {
  items: { id: string; friendInteractions?: unknown[]; friendInteractionCount?: number }[];
  nextCursor?: string;
};
const ids = (response: { json: () => unknown }) =>
  (response.json() as FriendsPage).items.map((post) => post.id);

describe('GET /v1/reels/friends', () => {
  it('démo : B aime un reel public → présent avec B ; B passe à « Personne » → absent', async () => {
    const lea = givenFriend(1);
    const reel = await givenPost(AUTHOR);
    await like(lea, reel);

    const response = await friendsTab();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        expect.objectContaining({
          id: reel,
          kind: 'reel',
          author: { id: AUTHOR, username: 'author' },
          friendInteractions: [{ user: { id: lea, username: 'ami1' }, kinds: ['liked'] }],
          friendInteractionCount: 1,
        }),
      ],
    });

    const settings = await call(lea, 'PATCH', '/v1/me/settings', { friendsTabActivity: 'nobody' });
    expect(settings.statusCode).toBe(200);
    expect(ids(await friendsTab())).toEqual([]);
  });

  it('3 aperçus au plus, nombre total d’amis, texte du commentaire', async () => {
    const reel = await givenPost(AUTHOR);
    for (let n = 1; n <= 4; n++) await like(givenFriend(n), reel);
    await call(friendId(4), 'POST', `/v1/posts/${reel}/comments`, { body: 'Trop bien' });

    const [item] = (await friendsTab()).json<FriendsPage>().items;

    expect(item?.friendInteractionCount).toBe(4);
    expect(item?.friendInteractions).toHaveLength(3);
    expect(item?.friendInteractions?.[0]).toEqual({
      user: { id: friendId(4), username: 'ami4' },
      kinds: ['liked', 'commented'],
      commentText: 'Trop bien',
    });
  });

  it('pagine par 10 sans doublon', async () => {
    const lea = givenFriend(1);
    const reels: string[] = [];
    for (let i = 0; i < 11; i++) {
      const reel = await givenPost(AUTHOR);
      reels.push(reel);
      await like(lea, reel);
    }

    const first = await friendsTab();
    const { nextCursor } = first.json<FriendsPage>();
    const second = await friendsTab(`?cursor=${nextCursor}`);

    expect(ids(first)).toEqual(reels.slice(1).reverse());
    expect(ids(second)).toEqual([reels[0]]);
    expect(second.json<FriendsPage>().nextCursor).toBeUndefined();
  });

  it('sans ami → liste vide sans nextCursor', async () => {
    await givenPost(AUTHOR);

    expect((await friendsTab()).json()).toEqual({ items: [] });
  });

  it('curseur invalide → 400 invalid_cursor', async () => {
    const response = await friendsTab('?cursor=pas-un-curseur');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });

  it('sans JWT → 401', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/reels/friends' });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /v1/reels/{id}/friend-interactions', () => {
  it('liste complète, interaction la plus récente en premier', async () => {
    const reel = await givenPost(AUTHOR);
    for (let n = 1; n <= 4; n++) await like(givenFriend(n), reel);

    const response = await interactionsOf(reel);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [4, 3, 2, 1].map((n) => ({
        user: { id: friendId(n), username: `ami${n}` },
        kinds: ['liked'],
      })),
    });
  });

  it('reel d’un ami sans autre interaction → « a créé »', async () => {
    const lea = givenFriend(1);
    const reel = await givenPost(lea);

    expect((await interactionsOf(reel)).json()).toEqual({
      items: [{ user: { id: lea, username: 'ami1' }, kinds: ['created'] }],
    });
  });

  it('reel d’un compte privé que je ne suis pas, aimé par un ami → 404 post_not_found', async () => {
    const lea = givenFriend(1);
    context.relationships.follow(lea, PRIVATE);
    const reel = await givenPost(PRIVATE);
    await like(lea, reel);

    const response = await interactionsOf(reel);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });

  it.each([
    ['post photo', async () => givenPost(AUTHOR, 'post')],
    ['reel inexistant', () => Promise.resolve('0199a1b2-0000-7000-8000-00000000ffff')],
  ])('%s → 404 post_not_found', async (_case, given) => {
    const response = await interactionsOf(await given());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });

  it('id mal formé → 400', async () => {
    expect((await interactionsOf('pas-un-uuid')).statusCode).toBe(400);
  });
});

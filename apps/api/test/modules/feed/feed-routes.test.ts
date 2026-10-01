import { encodeCursor } from '@clone/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const FOLLOWED = '0199a1b2-0000-7000-8000-000000000002';
const OTHER = '0199a1b2-0000-7000-8000-000000000003';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian' });
});

afterEach(async () => {
  await context.app.close();
});

const getFeed = (query = '') =>
  context.app.inject({ method: 'GET', url: `/v1/feed${query}`, headers: auth });

let mediaCounter = 0;
/** Publie un post de `authorId` avec une image prête. */
async function givenPost(authorId: string): Promise<string> {
  const mediaId = `0199a1b2-0000-7000-c000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({ id: mediaId, ownerId: authorId, purpose: 'post' });
  const post = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers: { authorization: `Bearer ${await signTestToken(authorId)}` },
    payload: { kind: 'post', mediaIds: [mediaId] },
  });
  expect(post.statusCode).toBe(201);
  return post.json<{ id: string }>().id;
}

const ids = (response: { json: () => unknown }) =>
  (response.json() as { items: { id: string }[] }).items.map((post) => post.id);

describe('GET /v1/feed', () => {
  it('mes posts et ceux des comptes suivis, pas les autres, du plus récent au plus ancien', async () => {
    context.profiles.add({ id: FOLLOWED, username: 'lea' });
    context.profiles.add({ id: OTHER, username: 'hugo' });
    context.relationships.follow(ME, FOLLOWED);
    const mine = await givenPost(ME);
    const followed = await givenPost(FOLLOWED);
    await givenPost(OTHER);

    const response = await getFeed();

    expect(response.statusCode).toBe(200);
    expect(ids(response)).toEqual([followed, mine]);
    expect(response.json()).not.toHaveProperty('nextCursor');
  });

  it('pagine par 12 sans doublon', async () => {
    const posted: string[] = [];
    for (let i = 0; i < 13; i++) posted.push(await givenPost(ME));

    const first = await getFeed();
    const { nextCursor } = first.json<{ nextCursor: string }>();

    expect(ids(first)).toEqual(posted.slice(1).reverse());
    expect(nextCursor).toEqual(expect.any(String));

    const second = await getFeed(`?cursor=${nextCursor}`);

    expect(second.json()).toEqual({ items: [expect.objectContaining({ id: posted[0] })] });
  });

  it('feed vide → liste vide sans nextCursor', async () => {
    expect((await getFeed()).json()).toEqual({ items: [] });
  });

  it('compte privé suivi → ses posts sont dans le feed', async () => {
    context.profiles.add({ id: FOLLOWED, username: 'chloe', isPrivate: true });
    context.relationships.follow(ME, FOLLOWED);
    const post = await givenPost(FOLLOWED);

    expect(ids(await getFeed())).toEqual([post]);
  });

  it.each([
    ['auteur suspendu', { status: 'suspended' as const }, null],
    ['auteur banni', { status: 'banned' as const }, null],
    ['auteur que j’ai bloqué', {}, 'me' as const],
    ['auteur qui m’a bloqué', {}, 'author' as const],
  ])('%s → absent du feed', async (_case, fields, blocker) => {
    context.profiles.add({ id: FOLLOWED, username: 'lea' });
    context.relationships.follow(ME, FOLLOWED);
    await givenPost(FOLLOWED);
    const author = context.profiles.rows.get(FOLLOWED);
    if (author) context.profiles.rows.set(FOLLOWED, { ...author, ...fields });
    if (blocker === 'me') context.relationships.block(ME, FOLLOWED);
    if (blocker === 'author') context.relationships.block(FOLLOWED, ME);

    expect(ids(await getFeed())).toEqual([]);
  });

  it('post supprimé → absent du feed', async () => {
    const post = await givenPost(ME);
    await context.app.inject({ method: 'DELETE', url: `/v1/posts/${post}`, headers: auth });

    expect(ids(await getFeed())).toEqual([]);
  });

  it.each(['pas-un-curseur', encodeCursor({ createdAt: new Date(), id: ME }).slice(0, -2) + '!!'])(
    'curseur invalide %s → 400 invalid_cursor',
    async (cursor) => {
      const response = await getFeed(`?cursor=${encodeURIComponent(cursor)}`);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
    },
  );

  it('sans JWT → 401', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/feed' });

    expect(response.statusCode).toBe(401);
  });
});

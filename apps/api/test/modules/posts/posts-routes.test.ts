import { encodeCursor } from '@clone/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_MEDIA_BASE_URL } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const PHOTO = '0199a1b2-0000-7000-b000-000000000001';

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

const publish = (body: object) =>
  context.app.inject({ method: 'POST', url: '/v1/posts', headers: auth, payload: body });
const get = (url: string) => context.app.inject({ method: 'GET', url, headers: auth });

let mediaCounter = 0;
/** Publie un post de `authorId` avec une image prête. */
async function givenPost(authorId: string, caption = ''): Promise<string> {
  const mediaId = `0199a1b2-0000-7000-c000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({ id: mediaId, ownerId: authorId, purpose: 'post' });
  const post = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers: { authorization: `Bearer ${await signTestToken(authorId)}` },
    payload: { kind: 'post', caption, mediaIds: [mediaId] },
  });
  expect(post.statusCode).toBe(201);
  return post.json<{ id: string }>().id;
}

describe('POST /v1/posts', () => {
  it('publie une photo → 201, média rattaché, post_count incrémenté', async () => {
    context.media.addReady({ id: PHOTO, ownerId: ME, purpose: 'post' });

    const response = await publish({
      kind: 'post',
      caption: '  Coucher de soleil  ',
      mediaIds: [PHOTO],
    });

    expect(response.statusCode).toBe(201);
    const storage = `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public`;
    const { id, ...post } = response.json<{ id: string }>();
    expect(id).toEqual(expect.any(String));
    expect(post).toEqual({
      kind: 'post',
      caption: 'Coucher de soleil',
      author: { id: ME, username: 'killian' },
      media: [
        {
          variants: {
            thumb: `${storage}/${PHOTO}/thumb.webp`,
            medium: `${storage}/${PHOTO}/medium.webp`,
            large: `${storage}/${PHOTO}/large.webp`,
          },
          width: 1080,
          height: 1350,
        },
      ],
      createdAt: '2026-09-25T12:00:00.000Z',
    });
    expect(context.media.rows.get(PHOTO)?.attachedAt).not.toBeNull();
    expect((await get('/v1/me')).json()).toMatchObject({ postCount: 1 });
  });

  it('sans légende → légende vide', async () => {
    context.media.addReady({ id: PHOTO, ownerId: ME, purpose: 'post' });

    const response = await publish({ kind: 'post', mediaIds: [PHOTO] });

    expect(response.json()).toMatchObject({ caption: '' });
  });

  it.each([
    ['un reel (P1)', { kind: 'reel', mediaIds: [PHOTO] }],
    ['deux médias (carrousel en T6b)', { kind: 'post', mediaIds: [PHOTO, OTHER] }],
    ['aucun média', { kind: 'post', mediaIds: [] }],
    [
      'une légende de 2 201 caractères',
      { kind: 'post', caption: 'a'.repeat(2201), mediaIds: [PHOTO] },
    ],
    ['un champ inconnu', { kind: 'post', mediaIds: [PHOTO], location: 'Paris' }],
  ])('%s → 400 validation_failed', async (_case, body) => {
    context.media.addReady({ id: PHOTO, ownerId: ME, purpose: 'post' });

    const response = await publish(body);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
    expect(context.posts.rows.size).toBe(0);
  });

  it.each([
    ['d’un autre utilisateur', { ownerId: OTHER }, 404, 'media_not_found'],
    ['pas encore prêt', { status: 'processing' as const }, 409, 'media_not_ready'],
    ['déjà utilisé', { attachedAt: new Date() }, 409, 'media_already_attached'],
    [
      'prévu pour la photo de profil',
      { purpose: 'avatar' as const },
      422,
      'media_purpose_mismatch',
    ],
  ])('média %s → %i %s, aucun post créé', async (_case, fields, status, code) => {
    context.media.addReady({ id: PHOTO, ownerId: ME, purpose: 'post', ...fields });

    const response = await publish({ kind: 'post', mediaIds: [PHOTO] });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
    expect(context.posts.rows.size).toBe(0);
  });

  it('média inexistant → 404 media_not_found', async () => {
    const response = await publish({ kind: 'post', mediaIds: [PHOTO] });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'media_not_found' });
  });

  it('sans profil → 404 profile_not_found', async () => {
    context.profiles.rows.delete(ME);

    const response = await publish({ kind: 'post', mediaIds: [PHOTO] });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });

  it('21e publication dans l’heure → 429 rate_limited avec Retry-After', async () => {
    for (let i = 0; i < 20; i++) await givenPost(ME);
    context.media.addReady({ id: PHOTO, ownerId: ME, purpose: 'post' });

    const response = await publish({ kind: 'post', mediaIds: [PHOTO] });

    expect(response.statusCode).toBe(429);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.headers['retry-after']).toMatch(/^\d+$/);
    expect(response.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('la limite est comptée par utilisateur', async () => {
    for (let i = 0; i < 20; i++) await givenPost(ME);
    context.profiles.add({ id: OTHER, username: 'lea' });

    await givenPost(OTHER);
  });

  it('sans JWT → 401', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/posts',
      payload: { kind: 'post', mediaIds: [PHOTO] },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /v1/posts/{id}', () => {
  it('mon post → 200', async () => {
    const id = await givenPost(ME, 'Salut');

    const response = await get(`/v1/posts/${id}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, caption: 'Salut', author: { id: ME } });
  });

  it('post d’un compte public → 200', async () => {
    context.profiles.add({ id: OTHER, username: 'lea' });
    const id = await givenPost(OTHER);

    expect((await get(`/v1/posts/${id}`)).statusCode).toBe(200);
  });

  it('compte privé suivi → 200', async () => {
    context.profiles.add({ id: OTHER, username: 'lea', isPrivate: true });
    context.relationships.follow(ME, OTHER);
    const id = await givenPost(OTHER);

    expect((await get(`/v1/posts/${id}`)).statusCode).toBe(200);
  });

  it.each([
    ['compte privé non suivi', { isPrivate: true }, false],
    ['auteur suspendu', { status: 'suspended' as const }, false],
    ['auteur banni', { status: 'banned' as const }, false],
    ['auteur qui m’a bloqué', {}, true],
  ])('%s → 404 post_not_found', async (_case, fields, blocked) => {
    context.profiles.add({ id: OTHER, username: 'lea' });
    const id = await givenPost(OTHER);
    const author = context.profiles.rows.get(OTHER);
    if (author) context.profiles.rows.set(OTHER, { ...author, ...fields });
    if (blocked) context.relationships.block(OTHER, ME);

    const response = await get(`/v1/posts/${id}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });

  it('auteur que j’ai bloqué → 404 post_not_found', async () => {
    context.profiles.add({ id: OTHER, username: 'lea' });
    const id = await givenPost(OTHER);
    context.relationships.block(ME, OTHER);

    expect((await get(`/v1/posts/${id}`)).statusCode).toBe(404);
  });

  it('post supprimé → 404 post_not_found', async () => {
    const id = await givenPost(ME);
    const row = context.posts.rows.get(id);
    if (row) context.posts.rows.set(id, { ...row, deletedAt: new Date() });

    expect((await get(`/v1/posts/${id}`)).json()).toMatchObject({ code: 'post_not_found' });
  });

  it('post inexistant → 404 post_not_found', async () => {
    const response = await get(`/v1/posts/${PHOTO}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });
});

describe('GET /v1/users/{id}/posts', () => {
  it('pagine par 12, du plus récent au plus ancien', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 13; i++) ids.push(await givenPost(ME));

    const first = await get(`/v1/users/${ME}/posts`);
    const body = first.json<{ items: { id: string }[]; nextCursor: string }>();

    expect(first.statusCode).toBe(200);
    expect(body.items.map((post) => post.id)).toEqual(ids.slice(1).reverse());
    expect(body.nextCursor).toEqual(expect.any(String));

    const second = await get(`/v1/users/${ME}/posts?cursor=${body.nextCursor}`);

    expect(second.json()).toEqual({ items: [expect.objectContaining({ id: ids[0] })] });
  });

  it('aucun post → liste vide sans nextCursor', async () => {
    expect((await get(`/v1/users/${ME}/posts`)).json()).toEqual({ items: [] });
  });

  it('compte privé suivi → 200', async () => {
    context.profiles.add({ id: OTHER, username: 'lea', isPrivate: true });
    context.relationships.follow(ME, OTHER);
    await givenPost(OTHER);

    const response = await get(`/v1/users/${OTHER}/posts`);

    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: unknown[] }>().items).toHaveLength(1);
  });

  it.each([
    ['compte privé non suivi', { isPrivate: true }, false],
    ['compte suspendu', { status: 'suspended' as const }, false],
    ['compte qui m’a bloqué', {}, true],
  ])('%s → 404 user_not_found', async (_case, fields, blocked) => {
    context.profiles.add({ id: OTHER, username: 'lea', ...fields });
    if (blocked) context.relationships.block(OTHER, ME);

    const response = await get(`/v1/users/${OTHER}/posts`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'user_not_found' });
  });

  it('compte inexistant → 404 user_not_found', async () => {
    expect((await get(`/v1/users/${OTHER}/posts`)).statusCode).toBe(404);
  });

  it.each(['pas-un-curseur', encodeCursor({ createdAt: new Date(), id: ME }).slice(0, -2) + '!!'])(
    'curseur invalide %s → 400 invalid_cursor',
    async (cursor) => {
      const response = await get(`/v1/users/${ME}/posts?cursor=${encodeURIComponent(cursor)}`);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
    },
  );
});

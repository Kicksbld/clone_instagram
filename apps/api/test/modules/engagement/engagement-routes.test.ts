import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const AUTHOR = '0199a1b2-0000-7000-8000-000000000002';
const UNKNOWN_POST = '0199a1b2-0000-7000-a000-00000000ffff';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian' });
  context.profiles.add({ id: AUTHOR, username: 'lea' });
});

afterEach(async () => {
  await context.app.close();
});

const likeUrl = (postId: string) => `/v1/posts/${postId}/like`;
const like = (postId: string, headers = auth) =>
  context.app.inject({ method: 'PUT', url: likeUrl(postId), headers });
const unlike = (postId: string, headers = auth) =>
  context.app.inject({ method: 'DELETE', url: likeUrl(postId), headers });
const get = (url: string) => context.app.inject({ method: 'GET', url, headers: auth });

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

describe('PUT /v1/posts/{id}/like', () => {
  it('aime un post → 200 LikeStatus', async () => {
    const postId = await givenPost(AUTHOR);

    const response = await like(postId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ liked: true, likeCount: 1 });
  });

  it('double like → 200, compteur inchangé', async () => {
    const postId = await givenPost(AUTHOR);
    await like(postId);

    expect((await like(postId)).json()).toEqual({ liked: true, likeCount: 1 });
  });

  it('post invisible (auteur qui m’a bloqué) → 404 post_not_found', async () => {
    const postId = await givenPost(AUTHOR);
    context.relationships.block(AUTHOR, ME);

    const response = await like(postId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });

  it('post supprimé → 404 post_not_found', async () => {
    const postId = await givenPost(ME);
    await context.app.inject({ method: 'DELETE', url: `/v1/posts/${postId}`, headers: auth });

    const response = await like(postId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });

  it('post inexistant → 404 post_not_found', async () => {
    expect((await like(UNKNOWN_POST)).json()).toMatchObject({ code: 'post_not_found' });
  });

  it('sans profil → 404 profile_not_found', async () => {
    const postId = await givenPost(AUTHOR);
    context.profiles.rows.delete(ME);

    expect((await like(postId)).json()).toMatchObject({ code: 'profile_not_found' });
  });

  it('id mal formé → 400', async () => {
    expect((await like('pas-un-uuid')).statusCode).toBe(400);
  });

  it('sans JWT → 401', async () => {
    expect((await like(UNKNOWN_POST, { authorization: '' })).statusCode).toBe(401);
  });
});

describe('DELETE /v1/posts/{id}/like', () => {
  it('n’aime plus → 200 LikeStatus', async () => {
    const postId = await givenPost(AUTHOR);
    await like(postId);

    const response = await unlike(postId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ liked: false, likeCount: 0 });
  });

  it('sans like → 200, compteur inchangé', async () => {
    const postId = await givenPost(AUTHOR);

    expect((await unlike(postId)).json()).toEqual({ liked: false, likeCount: 0 });
  });

  it('post invisible (compte privé non suivi) → 404 post_not_found', async () => {
    const postId = await givenPost(AUTHOR);
    context.profiles.add({ id: AUTHOR, username: 'lea', isPrivate: true });

    const response = await unlike(postId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });
});

describe('likeCount et viewerHasLiked dans les lectures de posts', () => {
  it('détail, grille et feed reflètent mon like', async () => {
    const postId = await givenPost(AUTHOR);
    context.relationships.follow(ME, AUTHOR);
    await like(postId);
    const liked = { id: postId, likeCount: 1, viewerHasLiked: true };

    expect((await get(`/v1/posts/${postId}`)).json()).toMatchObject(liked);
    expect((await get(`/v1/users/${AUTHOR}/posts`)).json()).toMatchObject({ items: [liked] });
    expect((await get('/v1/feed')).json()).toMatchObject({ items: [liked] });
  });

  it('le like d’un autre compte compte, sans être le mien', async () => {
    const postId = await givenPost(ME);
    await like(postId, { authorization: `Bearer ${await signTestToken(AUTHOR)}` });

    expect((await get(`/v1/posts/${postId}`)).json()).toMatchObject({
      likeCount: 1,
      viewerHasLiked: false,
    });
  });
});

describe('rate limit par défaut (ADR-005)', () => {
  it('121e requête dans la minute → 429 rate_limited avec Retry-After', async () => {
    const postId = await givenPost(AUTHOR);
    for (let i = 0; i < 120; i++) {
      expect((await like(postId)).statusCode).toBe(200);
    }

    const response = await unlike(postId);

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toMatch(/^\d+$/);
    expect(response.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('compté par utilisateur, toutes routes confondues', async () => {
    const postId = await givenPost(AUTHOR);
    for (let i = 0; i < 120; i++) await like(postId);

    expect((await get(`/v1/posts/${postId}`)).statusCode).toBe(429);
    const other = { authorization: `Bearer ${await signTestToken(AUTHOR)}` };
    expect((await unlike(postId, other)).statusCode).toBe(200);
  });

  it('/health n’est pas limité', async () => {
    for (let i = 0; i < 120; i++) await context.app.inject({ method: 'GET', url: '/health' });

    expect((await context.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

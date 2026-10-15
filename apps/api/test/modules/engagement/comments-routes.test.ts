import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const AUTHOR = '0199a1b2-0000-7000-8000-000000000002';
const OTHER = '0199a1b2-0000-7000-8000-000000000003';
const UNKNOWN = '0199a1b2-0000-7000-a000-00000000ffff';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian' });
  context.profiles.add({ id: AUTHOR, username: 'lea' });
  context.profiles.add({ id: OTHER, username: 'ines' });
});

afterEach(async () => {
  await context.app.close();
});

const as = async (userId: string) => ({
  authorization: `Bearer ${await signTestToken(userId)}`,
});
const get = (url: string, headers = auth) => context.app.inject({ method: 'GET', url, headers });
const post = (postId: string, payload: object, headers = auth) =>
  context.app.inject({ method: 'POST', url: `/v1/posts/${postId}/comments`, headers, payload });
const remove = (commentId: string, headers = auth) =>
  context.app.inject({ method: 'DELETE', url: `/v1/comments/${commentId}`, headers });

let mediaCounter = 0;
/** Publie un post de `authorId` avec une image prête. */
async function givenPost(authorId: string): Promise<string> {
  const mediaId = `0199a1b2-0000-7000-b000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({ id: mediaId, ownerId: authorId, purpose: 'post' });
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers: await as(authorId),
    payload: { kind: 'post', mediaIds: [mediaId] },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

async function givenComment(postId: string, body = 'Super', parentId?: string): Promise<string> {
  const response = await post(postId, { body, ...(parentId && { parentId }) });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

describe('POST /v1/posts/{id}/comments', () => {
  it('commente → 201 Comment', async () => {
    const postId = await givenPost(AUTHOR);

    const response = await post(postId, { body: '  Bravo  ' });

    expect(response.statusCode).toBe(201);
    const { id, ...comment } = response.json<{ id: string }>();
    expect(id).toEqual(expect.any(String));
    expect(comment).toEqual({
      postId,
      author: { id: ME, username: 'killian' },
      body: 'Bravo',
      replyCount: 0,
      createdAt: '2026-09-25T12:00:00.000Z',
      viewerCanDelete: true,
    });
  });

  it('répond → 201 avec parentId, replyCount du parent à 1', async () => {
    const postId = await givenPost(AUTHOR);
    const parentId = await givenComment(postId);

    const response = await post(postId, { body: 'Merci', parentId });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ parentId });
    expect((await get(`/v1/posts/${postId}/comments`)).json()).toMatchObject({
      items: [{ id: parentId, replyCount: 1 }],
    });
  });

  it('réponse à une réponse → 422 reply_to_reply', async () => {
    const postId = await givenPost(AUTHOR);
    const parentId = await givenComment(postId);
    const replyId = await givenComment(postId, 'Réponse', parentId);

    const response = await post(postId, { body: 'Encore', parentId: replyId });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'reply_to_reply' });
  });

  it('parent d’un autre post → 404 comment_not_found', async () => {
    const [postId, otherPostId] = [await givenPost(AUTHOR), await givenPost(AUTHOR)];
    const parentId = await givenComment(otherPostId);

    const response = await post(postId, { body: 'Ici', parentId });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'comment_not_found' });
  });

  it.each([[''], ['   '], ['a'.repeat(2201)]])('corps %j → 400 validation_failed', async (body) => {
    const postId = await givenPost(AUTHOR);

    const response = await post(postId, { body });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });

  it('champ inconnu → 400', async () => {
    const postId = await givenPost(AUTHOR);

    expect((await post(postId, { body: 'Ok', mention: 'x' })).statusCode).toBe(400);
  });

  it('post invisible (compte privé non suivi) → 404 post_not_found', async () => {
    const postId = await givenPost(AUTHOR);
    context.profiles.add({ id: AUTHOR, username: 'lea', isPrivate: true });

    const response = await post(postId, { body: 'Ok' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'post_not_found' });
  });

  it('31e commentaire dans la minute → 429 rate_limited', async () => {
    const postId = await givenPost(AUTHOR);
    for (let i = 0; i < 30; i++) {
      expect((await post(postId, { body: `n°${i}` })).statusCode).toBe(201);
    }

    const response = await post(postId, { body: 'Trop' });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toMatch(/^\d+$/);
    expect(response.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('sans JWT → 401', async () => {
    expect((await post(UNKNOWN, { body: 'Ok' }, { authorization: '' })).statusCode).toBe(401);
  });
});

describe('GET /v1/posts/{id}/comments', () => {
  it('du plus récent au plus ancien, commentaires d’un auteur bloqué masqués', async () => {
    const postId = await givenPost(AUTHOR);
    const first = await givenComment(postId, 'Premier');
    await post(postId, { body: 'Bloqué' }, await as(OTHER));
    const second = await givenComment(postId, 'Deuxième');
    context.relationships.block(OTHER, ME);

    const response = await get(`/v1/posts/${postId}/comments`);

    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: { id: string }[] }>().items.map((c) => c.id)).toEqual([
      second,
      first,
    ]);
    expect(response.json()).not.toHaveProperty('nextCursor');
  });

  it('pages de 20 : nextCursor puis dernière page', async () => {
    const postId = await givenPost(AUTHOR);
    for (let i = 0; i < 21; i++) await givenComment(postId, `n°${i}`);

    const first = (await get(`/v1/posts/${postId}/comments`)).json<{
      items: unknown[];
      nextCursor: string;
    }>();
    expect(first.items).toHaveLength(20);

    const second = await get(
      `/v1/posts/${postId}/comments?cursor=${encodeURIComponent(first.nextCursor)}`,
    );
    expect(second.json()).toMatchObject({ items: [{ body: 'n°0' }] });
    expect(second.json()).not.toHaveProperty('nextCursor');
  });

  it('curseur invalide → 400 invalid_cursor', async () => {
    const postId = await givenPost(AUTHOR);

    const response = await get(`/v1/posts/${postId}/comments?cursor=pas-un-curseur`);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });

  it('post inexistant → 404 post_not_found', async () => {
    expect((await get(`/v1/posts/${UNKNOWN}/comments`)).json()).toMatchObject({
      code: 'post_not_found',
    });
  });
});

describe('GET /v1/comments/{id}/replies', () => {
  it('réponses du plus récent au plus ancien', async () => {
    const postId = await givenPost(AUTHOR);
    const parentId = await givenComment(postId);
    const first = await givenComment(postId, 'Un', parentId);
    const second = await givenComment(postId, 'Deux', parentId);

    const response = await get(`/v1/comments/${parentId}/replies`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        { id: second, parentId, replyCount: 0 },
        { id: first, parentId },
      ],
    });
  });

  it('commentaire inexistant → 404 comment_not_found', async () => {
    const response = await get(`/v1/comments/${UNKNOWN}/replies`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'comment_not_found' });
  });
});

describe('DELETE /v1/comments/{id}', () => {
  it('supprime mon commentaire et ses réponses → 204, commentCount du post à jour', async () => {
    const postId = await givenPost(AUTHOR);
    const parentId = await givenComment(postId);
    await post(postId, { body: 'Réponse', parentId }, await as(OTHER));
    await givenComment(postId, 'Reste');
    expect((await get(`/v1/posts/${postId}`)).json()).toMatchObject({ commentCount: 3 });

    const response = await remove(parentId);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await get(`/v1/posts/${postId}`)).json()).toMatchObject({ commentCount: 1 });
  });

  it('l’auteur du post supprime le commentaire d’un autre → 204', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId);

    expect((await remove(commentId, await as(AUTHOR))).statusCode).toBe(204);
  });

  it('par un tiers → 404 comment_not_found', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId);

    const response = await remove(commentId, await as(OTHER));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'comment_not_found' });
  });

  it('déjà supprimé → 404 comment_not_found', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId);
    await remove(commentId);

    expect((await remove(commentId)).json()).toMatchObject({ code: 'comment_not_found' });
  });
});

describe('commentCount dans les lectures de posts', () => {
  it('détail, grille et feed', async () => {
    const postId = await givenPost(AUTHOR);
    context.relationships.follow(ME, AUTHOR);
    await givenComment(postId);
    const counted = { id: postId, commentCount: 1 };

    expect((await get(`/v1/posts/${postId}`)).json()).toMatchObject(counted);
    expect((await get(`/v1/users/${AUTHOR}/posts`)).json()).toMatchObject({ items: [counted] });
    expect((await get('/v1/feed')).json()).toMatchObject({ items: [counted] });
  });
});

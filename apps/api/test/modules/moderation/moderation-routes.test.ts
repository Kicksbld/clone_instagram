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
const report = (payload: object, headers = auth) =>
  context.app.inject({ method: 'POST', url: '/v1/reports', headers, payload });

let mediaCounter = 0;
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

async function givenComment(postId: string, authorId: string): Promise<string> {
  const response = await context.app.inject({
    method: 'POST',
    url: `/v1/posts/${postId}/comments`,
    headers: await as(authorId),
    payload: { body: 'Commentaire' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

describe('POST /v1/reports', () => {
  it('signale un post → 201 { id }, signalement enregistré avec ses précisions nettoyées', async () => {
    const postId = await givenPost(AUTHOR);

    const response = await report({
      targetType: 'post',
      targetId: postId,
      reason: 'other',
      details: '  Arnaque  ',
    });

    expect(response.statusCode).toBe(201);
    const { id } = response.json<{ id: string }>();
    expect(context.reports.rows).toEqual([
      {
        id,
        reporterId: ME,
        target: { type: 'post', id: postId },
        reason: 'other',
        details: 'Arnaque',
      },
    ]);
  });

  it('signale un commentaire et un compte ; doublon accepté ; précisions vides ignorées', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId, OTHER);

    const comment = { targetType: 'comment', targetId: commentId, reason: 'harassment' };
    expect((await report(comment)).statusCode).toBe(201);
    expect((await report({ ...comment, details: '   ' })).statusCode).toBe(201);
    expect((await report({ targetType: 'user', targetId: OTHER, reason: 'spam' })).statusCode).toBe(
      201,
    );
    expect(context.reports.rows.map((row) => [row.target.type, row.details])).toEqual([
      ['comment', null],
      ['comment', null],
      ['user', null],
    ]);
  });

  it('commentaire d’un autre sur mon post : signalable', async () => {
    const postId = await givenPost(ME);
    const commentId = await givenComment(postId, OTHER);
    const response = await report({ targetType: 'comment', targetId: commentId, reason: 'hate' });
    expect(response.statusCode).toBe(201);
  });

  it('soi-même ou son propre contenu → 422 cannot_report_self', async () => {
    const postId = await givenPost(ME);
    const commentId = await givenComment(postId, ME);
    for (const [targetType, targetId] of [
      ['user', ME],
      ['post', postId],
      ['comment', commentId],
    ]) {
      const response = await report({ targetType, targetId, reason: 'spam' });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'cannot_report_self' });
    }
  });

  it('cible inexistante → 404 du type de la cible', async () => {
    for (const [targetType, code] of [
      ['post', 'post_not_found'],
      ['comment', 'comment_not_found'],
      ['user', 'user_not_found'],
    ]) {
      const response = await report({ targetType, targetId: UNKNOWN, reason: 'spam' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code });
    }
  });

  it('cible invisible (blocage, compte privé non suivi) → 404', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId, OTHER);
    context.relationships.block(OTHER, ME);
    expect(
      (await report({ targetType: 'comment', targetId: commentId, reason: 'spam' })).json(),
    ).toMatchObject({ code: 'comment_not_found' });
    expect(
      (await report({ targetType: 'user', targetId: OTHER, reason: 'spam' })).json(),
    ).toMatchObject({ code: 'user_not_found' });

    const author = context.profiles.rows.get(AUTHOR);
    if (author) author.isPrivate = true;
    expect(
      (await report({ targetType: 'post', targetId: postId, reason: 'spam' })).json(),
    ).toMatchObject({ code: 'post_not_found' });
    expect(context.reports.rows).toHaveLength(0);
  });

  it('type ou motif inconnu, précisions trop longues, champ inconnu → 400', async () => {
    const base = { targetType: 'user', targetId: OTHER, reason: 'spam' };
    expect((await report({ ...base, targetType: 'story' })).statusCode).toBe(400);
    expect((await report({ ...base, reason: 'boring' })).statusCode).toBe(400);
    expect((await report({ ...base, details: 'x'.repeat(501) })).statusCode).toBe(400);
    expect((await report({ ...base, extra: true })).statusCode).toBe(400);
  });

  it('11e signalement dans l’heure → 429 rate_limited', async () => {
    for (let i = 0; i < 10; i++) {
      expect(
        (await report({ targetType: 'user', targetId: OTHER, reason: 'spam' })).statusCode,
      ).toBe(201);
    }

    const response = await report({ targetType: 'user', targetId: OTHER, reason: 'spam' });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toMatch(/^\d+$/);
    expect(response.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('sans profil → 404 profile_not_found ; sans JWT → 401', async () => {
    const noProfile = await report(
      { targetType: 'user', targetId: OTHER, reason: 'spam' },
      await as(UNKNOWN),
    );
    expect(noProfile.json()).toMatchObject({ code: 'profile_not_found' });
    expect(
      (await report({ targetType: 'user', targetId: OTHER, reason: 'spam' }, { authorization: '' }))
        .statusCode,
    ).toBe(401);
  });
});

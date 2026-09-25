import { encodeCursor } from '@clone/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_MEDIA_BASE_URL } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const THIRD = '0199a1b2-0000-7000-8000-000000000003';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian', fullName: 'Killian' });
});

afterEach(async () => {
  await context.app.close();
});

const inject = (method: 'GET' | 'PUT' | 'DELETE', url: string) =>
  context.app.inject({ method, url, headers: auth });

describe('PUT /v1/users/{id}/follow', () => {
  it('suit le compte → 200, puis le profil reflète la relation et les compteurs', async () => {
    context.profiles.add({ id: OTHER, username: 'lea', followerCount: 2 });

    const response = await inject('PUT', `/v1/users/${OTHER}/follow`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ following: true, followerCount: 3 });
    const profile = await inject('GET', '/v1/users/lea');
    expect(profile.json()).toMatchObject({
      followerCount: 3,
      relationship: { following: true, followedBy: false },
    });
    const me = await inject('GET', '/v1/me');
    expect(me.json()).toMatchObject({ followingCount: 1 });
  });

  it('double follow → 200, compteur inchangé', async () => {
    context.profiles.add({ id: OTHER, username: 'lea' });
    await inject('PUT', `/v1/users/${OTHER}/follow`);

    const response = await inject('PUT', `/v1/users/${OTHER}/follow`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ following: true, followerCount: 1 });
  });

  it('soi-même → 422 cannot_follow_self', async () => {
    const response = await inject('PUT', `/v1/users/${ME}/follow`);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'cannot_follow_self' });
  });

  it('compte privé → 403 account_private', async () => {
    context.profiles.add({ id: OTHER, username: 'lea', isPrivate: true });

    const response = await inject('PUT', `/v1/users/${OTHER}/follow`);

    expect(response.statusCode).toBe(403);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ code: 'account_private' });
  });

  it('compte bloqué → 404 user_not_found', async () => {
    context.profiles.add({ id: OTHER, username: 'lea' });
    context.relationships.block(OTHER, ME);

    const response = await inject('PUT', `/v1/users/${OTHER}/follow`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'user_not_found' });
  });

  it('id qui n’est pas un UUID → 400', async () => {
    const response = await inject('PUT', '/v1/users/lea/follow');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });

  it('sans JWT → 401', async () => {
    const response = await context.app.inject({ method: 'PUT', url: `/v1/users/${OTHER}/follow` });

    expect(response.statusCode).toBe(401);
  });
});

describe('DELETE /v1/users/{id}/follow', () => {
  it('ne suit plus → 200, idempotent', async () => {
    context.profiles.add({ id: OTHER, username: 'lea' });
    await inject('PUT', `/v1/users/${OTHER}/follow`);

    const first = await inject('DELETE', `/v1/users/${OTHER}/follow`);
    const second = await inject('DELETE', `/v1/users/${OTHER}/follow`);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ following: false, followerCount: 0 });
    expect(second.json()).toEqual({ following: false, followerCount: 0 });
  });

  it('compte inexistant → 404 user_not_found', async () => {
    const response = await inject('DELETE', `/v1/users/${OTHER}/follow`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'user_not_found' });
  });
});

describe('GET /v1/users/{id}/followers et /following', () => {
  beforeEach(() => {
    context.profiles.add({ id: OTHER, username: 'lea', fullName: 'Léa' });
  });

  it('renvoie une page au format du contrat, avatar compris', async () => {
    context.profiles.add({
      id: THIRD,
      username: 'hugo',
      fullName: 'Hugo',
      avatar: {
        mediaId: '0199a1b2-0000-7000-8000-00000000aaaa',
        variants: { thumb: 'a/thumb.webp', medium: 'a/medium.webp', large: 'a/large.webp' },
      },
    });
    context.relationships.follow(THIRD, OTHER);
    context.relationships.follow(OTHER, ME);

    const followers = await inject('GET', `/v1/users/${OTHER}/followers`);
    expect(followers.statusCode).toBe(200);
    expect(followers.json()).toEqual({
      items: [
        {
          id: THIRD,
          username: 'hugo',
          fullName: 'Hugo',
          isPrivate: false,
          avatar: {
            thumb: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/a/thumb.webp`,
            medium: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/a/medium.webp`,
            large: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/a/large.webp`,
          },
          relationship: { following: false, followedBy: false },
        },
      ],
    });

    const following = await inject('GET', `/v1/users/${OTHER}/following`);
    expect(following.json()).toEqual({
      items: [
        {
          id: ME,
          username: 'killian',
          fullName: 'Killian',
          isPrivate: false,
          relationship: { following: false, followedBy: false },
        },
      ],
    });
  });

  it('pagine avec nextCursor', async () => {
    for (let i = 0; i < 21; i++) {
      const id = `0199a1b2-0000-7000-8000-1000000000${String(i).padStart(2, '0')}`;
      context.profiles.add({ id, username: `u${i}` });
      context.relationships.follow(id, OTHER);
    }

    const first = await inject('GET', `/v1/users/${OTHER}/followers`);
    const { items, nextCursor } = first.json<{ items: unknown[]; nextCursor: string }>();
    expect(items).toHaveLength(20);
    expect(nextCursor).toEqual(expect.any(String));

    const second = await inject(
      'GET',
      `/v1/users/${OTHER}/followers?cursor=${encodeURIComponent(nextCursor)}`,
    );
    expect(second.json()).toEqual({ items: [expect.objectContaining({ username: 'u0' })] });
  });

  it.each([
    ['mal formé', 'pas-un-curseur!'],
    [
      'id qui n’est pas un UUID',
      Buffer.from('["2026-09-25T12:00:00.000Z","42"]').toString('base64url'),
    ],
  ])('curseur %s → 400 invalid_cursor', async (_, cursor) => {
    const response = await inject('GET', `/v1/users/${OTHER}/followers?cursor=${cursor}`);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });

  it('curseur valide accepté pour un id de profil UUID v4', async () => {
    const cursor = encodeCursor({
      createdAt: new Date('2027-01-01T00:00:00.000Z'),
      id: '9b2f7c1e-8a3d-4f6b-9c2e-1d4a5b6c7d8e',
    });

    const response = await inject('GET', `/v1/users/${OTHER}/following?cursor=${cursor}`);

    expect(response.statusCode).toBe(200);
  });

  it('compte privé non suivi → 404 user_not_found', async () => {
    context.profiles.add({ id: THIRD, username: 'chloe', isPrivate: true });

    const response = await inject('GET', `/v1/users/${THIRD}/following`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'user_not_found' });
  });
});

describe('GET /v1/search/users', () => {
  it('trouve par username ou nom, sans les comptes bloqués', async () => {
    context.profiles.add({ id: OTHER, username: 'lea.martin', fullName: 'Léa Martin' });
    context.profiles.add({ id: THIRD, username: 'lea.roux', fullName: 'Léa Roux' });
    context.relationships.block(ME, THIRD);

    const response = await inject('GET', '/v1/search/users?q=%40Lea');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: OTHER,
          username: 'lea.martin',
          fullName: 'Léa Martin',
          isPrivate: false,
          relationship: { following: false, followedBy: false },
        },
      ],
    });
  });

  it('un username « search » reste accessible par GET /v1/users/{username}', async () => {
    context.profiles.add({ id: OTHER, username: 'search' });

    const response = await inject('GET', '/v1/users/search');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: OTHER });
  });

  it.each([
    ['/v1/search/users'],
    ['/v1/search/users?q='],
    [`/v1/search/users?q=${'a'.repeat(65)}`],
  ])('%s → 400 validation_failed', async (url) => {
    const response = await inject('GET', url);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });
});

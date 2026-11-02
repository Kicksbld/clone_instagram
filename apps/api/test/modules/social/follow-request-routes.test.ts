import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const PRIVATE = '0199a1b2-0000-7000-8000-000000000001';
const REQUESTER = '0199a1b2-0000-7000-8000-000000000002';

let context: ReturnType<typeof buildTestApp>;

beforeEach(() => {
  context = buildTestApp();
  context.profiles.add({ id: PRIVATE, username: 'prive', isPrivate: true });
  context.profiles.add({ id: REQUESTER, username: 'demandeur' });
});

afterEach(async () => {
  await context.app.close();
});

const as =
  (userId: string) =>
  async (method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH', url: string, payload?: object) =>
    context.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${await signTestToken(userId)}` },
      ...(payload && { payload }),
    });

const owner = as(PRIVATE);
const requester = as(REQUESTER);

describe('Démo T20 : demande, acceptation depuis l’Activité', () => {
  it('B demande (« Demandé »), A accepte, B voit les posts de A et l’acceptation', async () => {
    const follow = await requester('PUT', `/v1/users/${PRIVATE}/follow`);
    expect(follow.json()).toEqual({ following: false, requested: true, followerCount: 0 });

    const profile = await requester('GET', '/v1/users/prive');
    expect(profile.json()).toMatchObject({
      canViewContent: false,
      relationship: { following: false, followedBy: false, requested: true },
    });
    expect((await requester('GET', `/v1/users/${PRIVATE}/posts`)).statusCode).toBe(404);

    const activity = await owner('GET', '/v1/activity');
    expect(activity.json()).toMatchObject({
      items: [{ type: 'follow_request', actor: { username: 'demandeur' } }],
    });
    const pending = await owner('GET', '/v1/me/follow-requests');
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual({
      items: [
        {
          id: REQUESTER,
          username: 'demandeur',
          fullName: 'Test',
          isPrivate: false,
          relationship: { following: false, followedBy: false, requested: false },
        },
      ],
    });

    const accepted = await owner('POST', `/v1/follow-requests/${REQUESTER}/accept`);
    expect(accepted.statusCode).toBe(204);

    const after = await requester('GET', '/v1/users/prive');
    expect(after.json()).toMatchObject({
      canViewContent: true,
      followerCount: 1,
      relationship: { following: true, requested: false },
    });
    expect((await requester('GET', `/v1/users/${PRIVATE}/posts`)).statusCode).toBe(200);
    expect((await requester('GET', '/v1/activity')).json()).toMatchObject({
      items: [{ type: 'follow_accepted', actor: { username: 'prive' } }],
    });
    expect((await owner('GET', '/v1/activity')).json()).toMatchObject({
      items: [{ type: 'follow', actor: { username: 'demandeur' } }],
    });
    expect((await owner('GET', '/v1/me/follow-requests')).json()).toEqual({ items: [] });
  });
});

describe('POST /v1/follow-requests/{requesterId}/accept et /decline', () => {
  it('demande annulée entre-temps → 404 follow_request_not_found', async () => {
    await requester('PUT', `/v1/users/${PRIVATE}/follow`);
    const cancel = await requester('DELETE', `/v1/users/${PRIVATE}/follow`);
    expect(cancel.json()).toEqual({ following: false, requested: false, followerCount: 0 });

    for (const decision of ['accept', 'decline']) {
      const response = await owner('POST', `/v1/follow-requests/${REQUESTER}/${decision}`);
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ code: 'follow_request_not_found' });
    }
  });

  it('refuser → 204, le demandeur reste sans accès et peut redemander', async () => {
    await requester('PUT', `/v1/users/${PRIVATE}/follow`);

    expect((await owner('POST', `/v1/follow-requests/${REQUESTER}/decline`)).statusCode).toBe(204);
    expect((await requester('GET', '/v1/users/prive')).json()).toMatchObject({
      canViewContent: false,
      relationship: { following: false, requested: false },
    });
    expect((await requester('GET', '/v1/activity')).json()).toMatchObject({ items: [] });
    expect((await requester('PUT', `/v1/users/${PRIVATE}/follow`)).json()).toMatchObject({
      requested: true,
    });
  });

  it('identifiant mal formé → 400 validation_failed', async () => {
    const response = await owner('POST', '/v1/follow-requests/pas-un-uuid/accept');
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /v1/me/follow-requests', () => {
  it('curseur invalide → 400 invalid_cursor', async () => {
    const response = await owner('GET', '/v1/me/follow-requests?cursor=nimporte');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });
});

describe('DELETE /v1/users/{id}/follower', () => {
  it('retire un abonné → 204, idempotent ; soi-même → 422', async () => {
    context.relationships.follow(REQUESTER, PRIVATE);

    expect((await owner('DELETE', `/v1/users/${REQUESTER}/follower`)).statusCode).toBe(204);
    expect((await owner('DELETE', `/v1/users/${REQUESTER}/follower`)).statusCode).toBe(204);
    expect(context.relationships.isFollowing(REQUESTER, PRIVATE)).toBe(false);

    const self = await owner('DELETE', `/v1/users/${PRIVATE}/follower`);
    expect(self.statusCode).toBe(422);
    expect(self.json()).toMatchObject({ code: 'cannot_follow_self' });
  });

  it('compte bloqué → 404 user_not_found', async () => {
    context.relationships.block(REQUESTER, PRIVATE);
    const response = await owner('DELETE', `/v1/users/${REQUESTER}/follower`);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'user_not_found' });
  });
});

describe('PATCH /v1/me/settings', () => {
  it('passage en public : les demandes en attente deviennent des abonnements', async () => {
    await requester('PUT', `/v1/users/${PRIVATE}/follow`);

    const response = await owner('PATCH', '/v1/me/settings', { isPrivate: false });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ isPrivate: false, followerCount: 1 });
    expect((await requester('GET', '/v1/users/prive')).json()).toMatchObject({
      relationship: { following: true, requested: false },
    });
  });
});

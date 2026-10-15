import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const UNKNOWN = '0199a1b2-0000-7000-8000-00000000ffff';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian', fullName: 'Killian' });
  context.profiles.add({ id: OTHER, username: 'lea', fullName: 'Léa' });
});

afterEach(async () => {
  await context.app.close();
});

const inject = (method: 'GET' | 'PUT' | 'DELETE', url: string, headers = auth) =>
  context.app.inject({ method, url, headers });

describe('PUT /v1/users/{id}/block', () => {
  it('bloque → 204 ; le compte disparaît ensuite du profil et de la recherche, dans les deux sens', async () => {
    await inject('PUT', `/v1/users/${OTHER}/follow`);

    const response = await inject('PUT', `/v1/users/${OTHER}/block`);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await inject('GET', '/v1/users/lea')).statusCode).toBe(404);
    expect((await inject('GET', '/v1/search/users?q=lea')).json()).toEqual({ items: [] });
    expect((await inject('GET', '/v1/me')).json()).toMatchObject({ followingCount: 0 });
    const asOther = { authorization: `Bearer ${await signTestToken(OTHER)}` };
    expect((await inject('GET', '/v1/users/killian', asOther)).statusCode).toBe(404);
    expect((await inject('PUT', `/v1/users/${ME}/follow`, asOther)).statusCode).toBe(404);
  });

  it('double blocage → 204', async () => {
    await inject('PUT', `/v1/users/${OTHER}/block`);
    expect((await inject('PUT', `/v1/users/${OTHER}/block`)).statusCode).toBe(204);
  });

  it('soi-même → 422 cannot_block_self ; compte inexistant → 404 user_not_found', async () => {
    const self = await inject('PUT', `/v1/users/${ME}/block`);
    expect(self.statusCode).toBe(422);
    expect(self.json()).toMatchObject({ code: 'cannot_block_self' });
    const unknown = await inject('PUT', `/v1/users/${UNKNOWN}/block`);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: 'user_not_found' });
  });

  it('identifiant mal formé → 400', async () => {
    expect((await inject('PUT', '/v1/users/pas-un-uuid/block')).statusCode).toBe(400);
  });
});

describe('DELETE /v1/users/{id}/block', () => {
  it('débloque → 204, le profil redevient visible', async () => {
    await inject('PUT', `/v1/users/${OTHER}/block`);

    expect((await inject('DELETE', `/v1/users/${OTHER}/block`)).statusCode).toBe(204);
    expect((await inject('GET', '/v1/users/lea')).statusCode).toBe(200);
  });

  it('sans blocage → 204', async () => {
    expect((await inject('DELETE', `/v1/users/${OTHER}/block`)).statusCode).toBe(204);
  });
});

describe('GET /v1/me/blocks', () => {
  it('liste mes blocages au format UserPage', async () => {
    await inject('PUT', `/v1/users/${OTHER}/block`);

    const response = await inject('GET', '/v1/me/blocks');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: OTHER,
          username: 'lea',
          fullName: 'Léa',
          isPrivate: false,
          relationship: { following: false, followedBy: false },
        },
      ],
    });
  });

  it('curseur invalide → 400 invalid_cursor', async () => {
    const response = await inject('GET', '/v1/me/blocks?cursor=nimporte');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });
});

describe('PATCH /v1/me/settings', () => {
  const patch = (payload: object) =>
    context.app.inject({ method: 'PATCH', url: '/v1/me/settings', headers: auth, payload });

  it('passe en privé puis en public → 200 Me', async () => {
    const response = await patch({ isPrivate: true });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: ME, isPrivate: true, plan: 'free' });
    expect((await patch({ isPrivate: false })).json()).toMatchObject({ isPrivate: false });
  });

  it('corps vide ou champ inconnu → 400', async () => {
    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ isPrivate: true, bio: 'x' })).statusCode).toBe(400);
  });

  it('sans profil → 404 profile_not_found', async () => {
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/v1/me/settings',
      headers: { authorization: `Bearer ${await signTestToken(UNKNOWN)}` },
      payload: { isPrivate: true },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const THIRD = '0199a1b2-0000-7000-8000-000000000003';
const UNKNOWN = '0199a1b2-0000-7000-8000-00000000ffff';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian', fullName: 'Killian' });
  context.profiles.add({ id: OTHER, username: 'lea', fullName: 'Léa' });
  context.profiles.add({ id: THIRD, username: 'ines', fullName: 'Inès' });
});

afterEach(async () => {
  await context.app.close();
});

const inject = (method: 'GET' | 'PUT' | 'DELETE', url: string, headers = auth) =>
  context.app.inject({ method, url, headers });

type Page = { items: { username: string }[]; nextCursor?: string };

const listedUsernames = async () =>
  (await inject('GET', '/v1/me/close-friends')).json<Page>().items.map((user) => user.username);

describe('PUT /v1/me/close-friends/{userId}', () => {
  it('ajoute → 204, le compte apparaît dans ma liste au format UserPage', async () => {
    const response = await inject('PUT', `/v1/me/close-friends/${OTHER}`);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await inject('GET', '/v1/me/close-friends')).json()).toEqual({
      items: [
        {
          id: OTHER,
          username: 'lea',
          fullName: 'Léa',
          isPrivate: false,
          relationship: { following: false, followedBy: false, requested: false },
        },
      ],
    });
  });

  it('aucune notification pour le compte ajouté', async () => {
    await inject('PUT', `/v1/me/close-friends/${OTHER}`);

    expect(context.notifications.rows.size).toBe(0);
  });

  it('double ajout → 204', async () => {
    await inject('PUT', `/v1/me/close-friends/${OTHER}`);
    expect((await inject('PUT', `/v1/me/close-friends/${OTHER}`)).statusCode).toBe(204);
    expect(await listedUsernames()).toEqual(['lea']);
  });

  it('soi-même → 422 cannot_close_friend_self', async () => {
    const response = await inject('PUT', `/v1/me/close-friends/${ME}`);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'cannot_close_friend_self' });
  });

  it('compte bloqué, qui m’a bloqué ou inexistant → 404 user_not_found', async () => {
    await inject('PUT', `/v1/users/${OTHER}/block`);
    const asThird = { authorization: `Bearer ${await signTestToken(THIRD)}` };
    await inject('PUT', `/v1/users/${ME}/block`, asThird);

    for (const id of [OTHER, THIRD, UNKNOWN]) {
      const response = await inject('PUT', `/v1/me/close-friends/${id}`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'user_not_found' });
    }
  });

  it('identifiant mal formé → 400', async () => {
    expect((await inject('PUT', '/v1/me/close-friends/pas-un-uuid')).statusCode).toBe(400);
  });
});

describe('DELETE /v1/me/close-friends/{userId}', () => {
  it('retire → 204 ; absent de la liste → 204', async () => {
    await inject('PUT', `/v1/me/close-friends/${OTHER}`);

    expect((await inject('DELETE', `/v1/me/close-friends/${OTHER}`)).statusCode).toBe(204);
    expect(await listedUsernames()).toEqual([]);
    expect((await inject('DELETE', `/v1/me/close-friends/${OTHER}`)).statusCode).toBe(204);
  });

  it('soi-même → 422 ; compte inexistant → 404', async () => {
    expect((await inject('DELETE', `/v1/me/close-friends/${ME}`)).statusCode).toBe(422);
    expect((await inject('DELETE', `/v1/me/close-friends/${UNKNOWN}`)).statusCode).toBe(404);
  });
});

describe('GET /v1/me/close-friends', () => {
  it('démo : deux amis proches, l’un retiré, l’autre bloqué → liste vide', async () => {
    await inject('PUT', `/v1/me/close-friends/${OTHER}`);
    await inject('PUT', `/v1/me/close-friends/${THIRD}`);
    expect(await listedUsernames()).toEqual(['ines', 'lea']);

    await inject('DELETE', `/v1/me/close-friends/${OTHER}`);
    await inject('PUT', `/v1/users/${THIRD}/block`);

    expect(await listedUsernames()).toEqual([]);
  });

  it('pages de 20, ajout le plus récent en premier, nextCursor jusqu’à la dernière page', async () => {
    const ids = Array.from(
      { length: 21 },
      (_, i) => `0199a1b2-0000-7000-8000-${String(100 + i).padStart(12, '0')}`,
    );
    for (const [i, id] of ids.entries()) {
      context.profiles.add({ id, username: `ami${i}` });
      await inject('PUT', `/v1/me/close-friends/${id}`);
    }

    const first = (await inject('GET', '/v1/me/close-friends')).json<Page>();
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.username).toBe('ami20');
    expect(first.nextCursor).toBeDefined();

    const second = (
      await inject('GET', `/v1/me/close-friends?cursor=${first.nextCursor ?? ''}`)
    ).json<Page>();
    expect(second.items.map((user) => user.username)).toEqual(['ami0']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('curseur invalide → 400 invalid_cursor', async () => {
    const response = await inject('GET', '/v1/me/close-friends?cursor=nimporte');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_cursor' });
  });

  it('sans authentification → 401', async () => {
    expect((await inject('GET', '/v1/me/close-friends', { authorization: '' })).statusCode).toBe(
      401,
    );
  });
});

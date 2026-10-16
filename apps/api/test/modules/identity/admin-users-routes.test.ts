import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_NOW } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ADMIN = '0199a1b2-0000-7000-8000-00000000a001';
const USER = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const UNKNOWN = '0199a1b2-0000-7000-a000-00000000ffff';

let context: ReturnType<typeof buildTestApp>;
let admin: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  context.adminRoles.admins.add(ADMIN);
  admin = { authorization: `Bearer ${await signTestToken(ADMIN)}` };
  context.profiles.add({ id: USER, username: 'ines', fullName: 'Inès' });
});

afterEach(async () => {
  await context.app.close();
});

const as = async (userId: string) => ({
  authorization: `Bearer ${await signTestToken(userId)}`,
});

describe('GET /v1/admin/me', () => {
  it('admin sans profil → 200', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: admin,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: ADMIN, role: 'admin' });
  });

  it('non-admin → 403 admin_required', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: await as(USER),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'admin_required' });
  });

  it('sans JWT → 401', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/admin/me' });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /v1/admin/users', () => {
  const list = async (query = '', headers = admin) =>
    context.app.inject({ method: 'GET', url: `/v1/admin/users${query}`, headers });

  it('pages de 20 du plus récent au plus ancien, curseur jusqu’à la dernière page', async () => {
    for (let index = 0; index < 24; index += 1) {
      context.profiles.add({
        id: `0199a1b2-0000-7000-8000-1000000000${String(index).padStart(2, '0')}`,
        username: `user${index}`,
        createdAt: new Date(TEST_NOW.getTime() + index * 1000),
      });
    }

    const first = await list();
    expect(first.statusCode).toBe(200);
    const page = first.json<{ items: { username: string }[]; nextCursor?: string }>();
    expect(page.items).toHaveLength(20);
    expect(page.items[0]?.username).toBe('user23');
    expect(page.nextCursor).toBeDefined();

    const second = await list(`?cursor=${encodeURIComponent(page.nextCursor ?? '')}`);
    const last = second.json<{ items: { username: string }[]; nextCursor?: string }>();
    expect(last.items).toHaveLength(5);
    expect(last.nextCursor).toBeUndefined();
  });

  it('résumé d’un compte, filtres q et status', async () => {
    context.profiles.add({ id: OTHER, username: 'killian', status: 'banned' });

    const response = await list('?q=%40ine&status=active');

    expect(response.json()).toEqual({
      items: [
        {
          id: USER,
          username: 'ines',
          fullName: 'Inès',
          status: 'active',
          followerCount: 0,
          followingCount: 0,
          postCount: 0,
          createdAt: TEST_NOW.toISOString(),
        },
      ],
    });
  });

  it('statut inconnu ou curseur invalide → 400 ; non-admin → 403', async () => {
    expect((await list('?status=deleted')).statusCode).toBe(400);
    expect((await list('?cursor=nimportequoi')).json()).toMatchObject({ code: 'invalid_cursor' });
    expect((await list('', await as(USER))).statusCode).toBe(403);
  });
});

describe('GET /v1/admin/users/{id}', () => {
  it('fiche : profil, plan et signalements reçus et émis', async () => {
    context.userReports.receivedBy.set(USER, {
      total: 3,
      items: [
        {
          id: '0199a1b2-0000-7000-c100-000000000001',
          targetType: 'post',
          targetId: '0199a1b2-0000-7000-a000-000000000001',
          reason: 'spam',
          details: null,
          status: 'open',
          reporter: { id: OTHER, username: 'killian' },
          createdAt: TEST_NOW,
        },
      ],
    });

    const response = await context.app.inject({
      method: 'GET',
      url: `/v1/admin/users/${USER}`,
      headers: admin,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: USER,
      username: 'ines',
      bio: '',
      isPrivate: false,
      plan: 'free',
      reportsReceived: {
        total: 3,
        items: [
          {
            targetType: 'post',
            reason: 'spam',
            status: 'open',
            reporter: { id: OTHER, username: 'killian' },
            createdAt: TEST_NOW.toISOString(),
          },
        ],
      },
      reportsFiled: { total: 0, items: [] },
    });
    const detail = response.json<{ reportsReceived: { items: object[] } }>();
    expect(detail.reportsReceived.items[0]).not.toHaveProperty('details');
  });

  it('compte inexistant → 404 user_not_found', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: `/v1/admin/users/${UNKNOWN}`,
      headers: admin,
    });
    expect(response.json()).toMatchObject({ status: 404, code: 'user_not_found' });
  });
});

describe('suspendre, bannir, réactiver', () => {
  const act = async (action: string, payload: object = { reason: 'Spam' }, headers = admin) =>
    context.app.inject({
      method: 'POST',
      url: `/v1/admin/users/${USER}/${action}`,
      headers,
      payload,
    });

  it('suspendu : l’utilisateur ne voit plus que GET /v1/me ; réactivé : accès rétabli', async () => {
    const suspended = await act('suspend');
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json()).toMatchObject({ id: USER, status: 'suspended' });
    expect(context.auditLog.entries).toHaveLength(1);

    const user = await as(USER);
    const feed = await context.app.inject({ method: 'GET', url: '/v1/feed', headers: user });
    expect(feed.json()).toMatchObject({ status: 403, code: 'account_suspended' });

    expect((await act('reactivate')).json()).toMatchObject({ status: 'active' });
    const again = await context.app.inject({ method: 'GET', url: '/v1/feed', headers: user });
    expect(again.statusCode).toBe(200);
  });

  it('bannir un compte suspendu, puis transition invalide → 409', async () => {
    await act('suspend');
    expect((await act('ban')).json()).toMatchObject({ status: 'banned' });

    const response = await act('suspend');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'invalid_status_transition' });
  });

  it('motif absent, vide ou champ inconnu → 400', async () => {
    expect((await act('suspend', {})).statusCode).toBe(400);
    expect((await act('suspend', { reason: '   ' })).statusCode).toBe(400);
    expect((await act('suspend', { reason: 'ok', extra: 1 })).statusCode).toBe(400);
    expect(context.profiles.rows.get(USER)?.status).toBe('active');
  });

  it('non-admin → 403 ; soi-même → 422', async () => {
    expect((await act('suspend', { reason: 'Spam' }, await as(OTHER))).statusCode).toBe(403);

    const self = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/users/${ADMIN}/ban`,
      headers: admin,
      payload: { reason: 'Test' },
    });
    expect(self.json()).toMatchObject({ status: 422, code: 'cannot_moderate_self' });
  });
});

describe('DELETE /v1/admin/users/{id}', () => {
  const remove = async (payload: object = { reason: 'Usurpation' }) =>
    context.app.inject({
      method: 'DELETE',
      url: `/v1/admin/users/${USER}`,
      headers: admin,
      payload,
    });

  it('204 : compte supprimé, purge enfilée, profil introuvable ensuite', async () => {
    const response = await remove();

    expect(response.statusCode).toBe(204);
    expect(context.authAccounts.deleted.has(USER)).toBe(true);
    expect(context.jobs.accountPurges.has(USER)).toBe(true);
    expect(context.auditLog.entries.at(-1)).toMatchObject({ action: 'user_deleted' });
    expect((await remove()).statusCode).toBe(404);
  });

  it('sans motif → 400 ; Supabase Auth injoignable → 500, compte intact', async () => {
    expect((await remove({})).statusCode).toBe(400);

    context.authAccounts.unavailable = true;
    expect((await remove()).statusCode).toBe(500);
    expect(context.profiles.rows.get(USER)?.status).toBe('active');
  });
});

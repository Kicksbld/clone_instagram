import { generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from './support/test-app.ts';
import { signTestToken, TEST_ISSUER } from './support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';

const otherKey = (await generateKeyPair('ES256')).privateKey;
const hs256 = await new SignJWT({})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(ME)
  .setIssuer(TEST_ISSUER)
  .setAudience('authenticated')
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long'));

const expired = Math.floor(Date.now() / 1000) - 60;
const invalid = {
  otherKey: await signTestToken(ME, { key: otherKey }),
  expired: await signTestToken(ME, { expiresIn: expired }),
  otherIssuer: await signTestToken(ME, { issuer: 'https://evil.example/auth/v1' }),
  otherAudience: await signTestToken(ME, { audience: 'anon' }),
  notUuid: await signTestToken('pas-un-uuid'),
};

let context: ReturnType<typeof buildTestApp>;

beforeEach(() => {
  context = buildTestApp();
  context.profiles.add({ id: ME, username: 'killian' });
});

afterEach(async () => {
  await context.app.close();
});

async function getMe(authorization?: string) {
  return context.app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe('authentification des routes /v1 (JWT Supabase ES256)', () => {
  it('JWT valide → accès', async () => {
    const response = await getMe(`Bearer ${await signTestToken(ME)}`);
    expect(response.statusCode).toBe(200);
  });

  it('/health reste public', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it.each([
    ['en-tête absent', undefined],
    ['schéma autre que Bearer', `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['jeton mal formé', 'Bearer pas-un-jwt'],
    ['signé en HS256 (secret partagé)', `Bearer ${hs256}`],
    ['signé par une autre clé', `Bearer ${invalid.otherKey}`],
    ['expiré', `Bearer ${invalid.expired}`],
    ['autre émetteur', `Bearer ${invalid.otherIssuer}`],
    ['autre audience', `Bearer ${invalid.otherAudience}`],
    ['sujet qui n’est pas un UUID', `Bearer ${invalid.notUuid}`],
  ])('%s → 401 unauthenticated', async (_label, authorization) => {
    const response = await getMe(authorization);

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 401, code: 'unauthenticated' });
  });

  it('compte supprimé, JWT encore valide → 401 unauthenticated', async () => {
    context.profiles.add({ id: ME, username: 'killian', status: 'deleted' });

    const response = await getMe(`Bearer ${await signTestToken(ME)}`);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ status: 401, code: 'unauthenticated' });
  });

  it('sans profil (onboarding en cours) → la requête passe', async () => {
    context.profiles.rows.delete(ME);

    const response = await getMe(`Bearer ${await signTestToken(ME)}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });

  it('401 avant la validation de l’entrée', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/me/onboarding',
      payload: { nimporte: 'quoi' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('compte suspendu ou banni (ADR-005)', () => {
  const request = async (method: 'GET' | 'DELETE', url: string) =>
    context.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${await signTestToken(ME)}` },
    });

  it.each(['suspended', 'banned'] as const)(
    '%s → 403 account_suspended sur toute route, sauf GET et DELETE /v1/me',
    async (status) => {
      context.profiles.add({ id: ME, username: 'killian', status });

      for (const url of ['/v1/feed', '/v1/users/killian', '/v1/me/blocks', '/v1/admin/me']) {
        const response = await request('GET', url);
        expect(response.statusCode, url).toBe(403);
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.json()).toMatchObject({ status: 403, code: 'account_suspended' });
      }

      const me = await request('GET', '/v1/me');
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ status });

      expect((await request('DELETE', '/v1/me')).statusCode).toBe(204);
    },
  );

  it('compte réactivé → accès rétabli', async () => {
    context.profiles.add({ id: ME, username: 'killian', status: 'suspended' });
    expect((await request('GET', '/v1/feed')).statusCode).toBe(403);

    context.profiles.add({ id: ME, username: 'killian', status: 'active' });
    expect((await request('GET', '/v1/feed')).statusCode).toBe(200);
  });
});

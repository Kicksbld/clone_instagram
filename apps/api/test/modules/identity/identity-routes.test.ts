import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
});

afterEach(async () => {
  await context.app.close();
});

const onboarding = { username: 'killian', fullName: 'Killian', birthDate: '2000-01-31' };

describe('GET /v1/me', () => {
  it('profil absent → 404 profile_not_found', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/me', headers: auth });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });

  it('renvoie mon profil au format du contrat', async () => {
    context.profiles.add({ id: ME, username: 'killian', fullName: 'Killian', bio: 'Dev' });

    const response = await context.app.inject({ method: 'GET', url: '/v1/me', headers: auth });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: ME,
      username: 'killian',
      fullName: 'Killian',
      bio: 'Dev',
      birthDate: '2000-01-01',
      isPrivate: false,
      status: 'active',
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      createdAt: '2026-09-25T12:00:00.000Z',
    });
  });
});

describe('POST /v1/me/onboarding', () => {
  const post = (payload: object) =>
    context.app.inject({ method: 'POST', url: '/v1/me/onboarding', headers: auth, payload });

  it('crée le profil → 201', async () => {
    const response = await post(onboarding);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: ME, username: 'killian', birthDate: '2000-01-31' });
  });

  it('username pris → 409 username_taken', async () => {
    context.profiles.add({ id: OTHER, username: 'killian' });
    const response = await post(onboarding);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'username_taken' });
  });

  it('second appel → 409 profile_already_exists', async () => {
    await post(onboarding);
    const response = await post({ ...onboarding, username: 'autre' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'profile_already_exists' });
  });

  it('moins de 13 ans → 422 age_requirement_not_met', async () => {
    const response = await post({ ...onboarding, birthDate: '2013-09-26' });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'age_requirement_not_met' });
  });

  it.each([
    ['username en majuscules', { ...onboarding, username: 'Killian' }],
    ['username avec espace', { ...onboarding, username: 'kil lian' }],
    ['username de 31 caractères', { ...onboarding, username: 'a'.repeat(31) }],
    ['nom vide', { ...onboarding, fullName: '' }],
    ['nom fait d’espaces', { ...onboarding, fullName: '   ' }],
    ['nom de 31 caractères', { ...onboarding, fullName: 'a'.repeat(31) }],
    ['date invalide', { ...onboarding, birthDate: '2000-02-30' }],
    ['champ manquant', { username: 'killian', fullName: 'Killian' }],
    ['champ inconnu', { ...onboarding, bio: 'bonjour' }],
  ])('%s → 400 validation_failed', async (_label, payload) => {
    const response = await post(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
    expect(context.profiles.rows.size).toBe(0);
  });
});

describe('PATCH /v1/me', () => {
  const patch = (payload: object) =>
    context.app.inject({ method: 'PATCH', url: '/v1/me', headers: auth, payload });

  it('modifie la bio (150 caractères acceptés)', async () => {
    context.profiles.add({ id: ME, username: 'killian' });
    const response = await patch({ bio: 'a'.repeat(150) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ bio: 'a'.repeat(150) });
  });

  it.each([
    ['bio de 151 caractères', { bio: 'a'.repeat(151) }],
    ['corps vide', {}],
    ['champ inconnu', { isPrivate: true }],
  ])('%s → 400 validation_failed', async (_label, payload) => {
    context.profiles.add({ id: ME, username: 'killian' });
    const response = await patch(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });

  it('username d’un autre → 409 username_taken', async () => {
    context.profiles.add({ id: ME, username: 'killian' });
    context.profiles.add({ id: OTHER, username: 'autre' });
    const response = await patch({ username: 'autre' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'username_taken' });
  });

  it('profil absent → 404 profile_not_found', async () => {
    const response = await patch({ bio: 'x' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });
});

describe('GET /v1/usernames/{username}/availability', () => {
  const check = (username: string) =>
    context.app.inject({
      method: 'GET',
      url: `/v1/usernames/${encodeURIComponent(username)}/availability`,
      headers: auth,
    });

  it('username libre', async () => {
    const response = await check('killian');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: 'killian', available: true, suggestions: [] });
  });

  it('username pris → suggestions', async () => {
    context.profiles.add({ id: OTHER, username: 'killian' });
    const response = await check('killian');

    expect(response.json()).toEqual({
      username: 'killian',
      available: false,
      suggestions: ['killian_', 'killian.', 'killian1'],
    });
  });

  it.each(['Killian', 'kil lian', 'a'.repeat(31)])('format invalide « %s » → 400', async (u) => {
    const response = await check(u);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });
});

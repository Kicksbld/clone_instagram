import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_MEDIA_BASE_URL } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const PHOTO = '0199a1b2-0000-7000-9000-000000000001';

let context: ReturnType<typeof buildTestApp>;
let auth: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  auth = { authorization: `Bearer ${await signTestToken(ME)}` };
  context.profiles.add({ id: ME, username: 'killian' });
});

afterEach(async () => {
  await context.app.close();
});

const publicUrl = (path: string) =>
  `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${path}`;
const variantsOf = (id: string) => ({
  thumb: publicUrl(`${id}/thumb.webp`),
  medium: publicUrl(`${id}/medium.webp`),
  large: publicUrl(`${id}/large.webp`),
});

describe('POST /v1/media/uploads', () => {
  const upload = { kind: 'image', purpose: 'avatar', mimeType: 'image/jpeg', sizeBytes: 2048 };
  const post = (payload: object, headers = auth) =>
    context.app.inject({ method: 'POST', url: '/v1/media/uploads', headers, payload });

  it('crée l’intention d’upload → 201', async () => {
    const response = await post(upload);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      mediaId: PHOTO,
      uploadUrl: `https://storage.test/upload/uploads/${ME}/${PHOTO}?token=test`,
      expiresAt: '2026-09-25T14:00:00.000Z',
    });
  });

  it.each([
    ['vidéo', { kind: 'video' }],
    ['usage post (T6a)', { purpose: 'post' }],
    ['type non accepté', { mimeType: 'image/heic' }],
    ['plus de 20 Mo', { sizeBytes: 20 * 1024 * 1024 + 1 }],
    ['taille nulle', { sizeBytes: 0 }],
    ['champ inconnu', { width: 100 }],
  ])('%s → 400 validation_failed', async (_label, change) => {
    const response = await post({ ...upload, ...change });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
    expect(context.media.rows.size).toBe(0);
  });

  it('sans profil → 404 profile_not_found', async () => {
    const response = await post(upload, {
      authorization: `Bearer ${await signTestToken(OTHER)}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'profile_not_found' });
  });

  it('sans JWT → 401', async () => {
    const response = await post(upload, { authorization: '' });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /v1/media/{id}/complete', () => {
  const complete = (id: string) =>
    context.app.inject({ method: 'POST', url: `/v1/media/${id}/complete`, headers: auth });

  it('confirme l’envoi → 200 uploaded, traitement enfilé', async () => {
    context.media.add({ id: PHOTO, ownerId: ME });

    const response = await complete(PHOTO);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: PHOTO,
      kind: 'image',
      purpose: 'avatar',
      status: 'uploaded',
    });
    expect(context.jobs.imageProcessing.has(PHOTO)).toBe(true);
  });

  it('transition invalide → 409 media_invalid_transition', async () => {
    context.media.addReady({ id: PHOTO, ownerId: ME });
    const response = await complete(PHOTO);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'media_invalid_transition' });
  });

  it('média d’un autre → 404 media_not_found', async () => {
    context.media.add({ id: PHOTO, ownerId: OTHER });
    const response = await complete(PHOTO);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'media_not_found' });
  });

  it('identifiant qui n’est pas un UUID → 400', async () => {
    expect((await complete('pas-un-uuid')).statusCode).toBe(400);
  });
});

describe('GET /v1/media/{id}', () => {
  const get = (id: string) =>
    context.app.inject({ method: 'GET', url: `/v1/media/${id}`, headers: auth });

  it('média prêt → variantes en URL publiques', async () => {
    context.media.addReady({ id: PHOTO, ownerId: ME });

    const response = await get(PHOTO);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: PHOTO,
      kind: 'image',
      purpose: 'avatar',
      status: 'ready',
      variants: variantsOf(PHOTO),
    });
  });

  it('média en échec → motif, sans variantes', async () => {
    context.media.add({ id: PHOTO, ownerId: ME, status: 'failed', failureReason: 'invalid_image' });

    expect((await get(PHOTO)).json()).toEqual({
      id: PHOTO,
      kind: 'image',
      purpose: 'avatar',
      status: 'failed',
      failureReason: 'invalid_image',
    });
  });

  it('média d’un autre → 404 media_not_found', async () => {
    context.media.addReady({ id: PHOTO, ownerId: OTHER });
    const response = await get(PHOTO);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'media_not_found' });
  });
});

describe('photo de profil', () => {
  const patch = (payload: object) =>
    context.app.inject({ method: 'PATCH', url: '/v1/me', headers: auth, payload });

  it('PATCH /v1/me avatarMediaId → Me avec avatar', async () => {
    context.media.addReady({ id: PHOTO, ownerId: ME });

    const response = await patch({ avatarMediaId: PHOTO });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ username: 'killian', avatar: variantsOf(PHOTO) });
    const me = await context.app.inject({ method: 'GET', url: '/v1/me', headers: auth });
    expect(me.json()).toMatchObject({ avatar: variantsOf(PHOTO) });
  });

  it.each([
    ['pas prêt', { status: 'processing' as const }, 409, 'media_not_ready'],
    [
      'déjà utilisé',
      { status: 'ready' as const, attachedAt: new Date() },
      409,
      'media_already_attached',
    ],
    [
      'autre usage',
      { status: 'ready' as const, purpose: 'post' as const },
      422,
      'media_purpose_mismatch',
    ],
    ['d’un autre', { status: 'ready' as const, ownerId: OTHER }, 404, 'media_not_found'],
  ])('média %s → %i %s', async (_label, media, status, code) => {
    context.media.add({ id: PHOTO, ownerId: ME, ...media });

    const response = await patch({ avatarMediaId: PHOTO });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
  });

  it('avatarMediaId null → 400 (retrait par DELETE /v1/me/avatar)', async () => {
    expect((await patch({ avatarMediaId: null })).statusCode).toBe(400);
  });

  it('DELETE /v1/me/avatar → Me sans avatar', async () => {
    context.media.addReady({ id: PHOTO, ownerId: ME });
    await patch({ avatarMediaId: PHOTO });

    const response = await context.app.inject({
      method: 'DELETE',
      url: '/v1/me/avatar',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('avatar');
    expect(context.media.rows.get(PHOTO)?.detachedAt).not.toBeNull();
  });
});

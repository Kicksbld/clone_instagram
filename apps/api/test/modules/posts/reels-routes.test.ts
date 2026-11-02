import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildTestApp, TEST_MEDIA_BASE_URL } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

let context: ReturnType<typeof buildTestApp>;
beforeEach(() => {
  context = buildTestApp();
});
afterEach(() => context.app.close());
const owner = '0199a1b2-0000-7000-8000-000000000001';
const video = '0199a1b2-0000-7000-8000-000000000002';
it('publie un reel prêt, expose HLS et durée et le retrouve dans la grille Reels', async () => {
  context.profiles.add({ id: owner, username: 'reels' });
  context.media.addReady({
    id: video,
    ownerId: owner,
    purpose: 'post',
    kind: 'video',
    variants: { hls: `${video}/hls/master.m3u8`, thumbnail: `${video}/thumbnail.webp` },
    durationMs: 20000,
  });
  const headers = { authorization: `Bearer ${await signTestToken(owner)}` };
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers,
    payload: { kind: 'reel', caption: 'Mon reel', mediaIds: [video] },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({
    kind: 'reel',
    media: [
      {
        durationMs: 20000,
        variants: {
          hls: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${video}/hls/master.m3u8`,
        },
      },
    ],
  });
  const page = await context.app.inject({ url: `/v1/users/${owner}/reels`, headers });
  expect(page.statusCode).toBe(200);
  expect(
    page.json<{ items: { id: string }[] }>().items.map((item: { id: string }) => item.id),
  ).toEqual([response.json<{ id: string }>().id]);
});

it('refuse une image utilisée comme reel avec 422', async () => {
  context.profiles.add({ id: owner, username: 'reels' });
  context.media.addReady({ id: video, ownerId: owner, purpose: 'post' });
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers: { authorization: `Bearer ${await signTestToken(owner)}` },
    payload: { kind: 'reel', mediaIds: [video] },
  });
  expect(response.statusCode).toBe(422);
  expect(response.json()).toMatchObject({ code: 'media_kind_mismatch' });
});

it.each([
  ['privé non suivi', { isPrivate: true }, false],
  ['suspendu', { status: 'suspended' as const }, false],
  ['banni', { status: 'banned' as const }, false],
  ['bloqué', {}, true],
])('grille du compte %s → 404', async (_label, fields, blocked) => {
  context.profiles.add({ id: owner, username: 'reels' });
  context.profiles.add({ id: video, username: 'other', ...fields });
  if (blocked) context.relationships.block(owner, video);
  const response = await context.app.inject({
    url: `/v1/users/${video}/reels`,
    headers: { authorization: `Bearer ${await signTestToken(owner)}` },
  });
  expect(response.statusCode).toBe(404);
});

it('upload MP4 de 50 Mo accepté, enfilé sur media-video ; image de 21 Mo refusée', async () => {
  context.profiles.add({ id: owner, username: 'reels' });
  const headers = { authorization: `Bearer ${await signTestToken(owner)}` };
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/media/uploads',
    headers,
    payload: { kind: 'video', purpose: 'post', mimeType: 'video/mp4', sizeBytes: 50 * 1024 * 1024 },
  });
  expect(response.statusCode).toBe(201);
  const mediaId = response.json<{ mediaId: string }>().mediaId;
  expect(
    (await context.app.inject({ method: 'POST', url: `/v1/media/${mediaId}/complete`, headers }))
      .statusCode,
  ).toBe(200);
  expect(context.jobs.videoProcessing.has(mediaId)).toBe(true);
  expect(context.jobs.imageProcessing.size).toBe(0);
  expect(
    (
      await context.app.inject({
        method: 'POST',
        url: '/v1/media/uploads',
        headers,
        payload: {
          kind: 'image',
          purpose: 'post',
          mimeType: 'image/jpeg',
          sizeBytes: 21 * 1024 * 1024,
        },
      })
    ).statusCode,
  ).toBe(400);
});

import type { components } from '@clone/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, TEST_NOW } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const A = '0199a1b2-0000-7000-8000-000000000001';
const B = '0199a1b2-0000-7000-8000-000000000002';
const C = '0199a1b2-0000-7000-8000-000000000003';
const PHOTO = '0199a1b2-0000-7000-a000-000000000001';
const CLIENT = '0199a1b2-0000-7000-b000-000000000001';

type Message = components['schemas']['Message'];

let context: ReturnType<typeof buildTestApp>;
const as = async (userId: string) => ({ authorization: `Bearer ${await signTestToken(userId)}` });

beforeEach(() => {
  context = buildTestApp();
  for (const [id, username] of [
    [A, 'alice'],
    [B, 'bob'],
    [C, 'charlie'],
  ] as const)
    context.profiles.add({ id, username, fullName: 'Test', isPrivate: true });
});
afterEach(() => context.app.close());

async function conversationWith(userId: string, viewerId = A): Promise<string> {
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/conversations',
    headers: await as(viewerId),
    payload: { userId },
  });
  return response.json<components['schemas']['Conversation']>().id;
}

async function sendPhoto(
  conversationId: string,
  payload: Record<string, unknown> = {},
  viewerId = A,
) {
  return context.app.inject({
    method: 'POST',
    url: `/v1/conversations/${conversationId}/messages`,
    headers: await as(viewerId),
    payload: { clientId: CLIENT, kind: 'image', mediaId: PHOTO, ...payload },
  });
}

async function signedUrl(viewerId: string, query = '?variant=large', mediaId = PHOTO) {
  return context.app.inject({
    url: `/v1/media/${mediaId}/signed-url${query}`,
    headers: await as(viewerId),
  });
}

describe('POST /v1/conversations/{id}/messages (image)', () => {
  it('rattache la photo au message, idempotent par clientId, et la notifie aux deux membres', async () => {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'message' });
    const id = await conversationWith(B);

    const first = await sendPhoto(id);
    expect(first.statusCode).toBe(201);
    expect(first.json<Message>()).toMatchObject({ kind: 'image', mediaId: PHOTO, body: '' });
    expect(context.media.rows.get(PHOTO)?.attachedAt).not.toBeNull();

    const retry = await sendPhoto(id);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());

    const history = await context.app.inject({
      url: `/v1/conversations/${id}/messages`,
      headers: await as(B),
    });
    expect(history.json<components['schemas']['MessagePage']>().items).toEqual([first.json()]);
  });

  it('garde le texte facultatif d’une photo', async () => {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'message' });
    const response = await sendPhoto(await conversationWith(B), { body: 'Regarde' });
    expect(response.json<Message>()).toMatchObject({ kind: 'image', body: 'Regarde' });
  });

  it.each([
    ['média d’un autre utilisateur', { ownerId: B }, 404, 'media_not_found'],
    ['média non ready', { status: 'processing' as const }, 409, 'media_not_ready'],
    ['média déjà rattaché', { attachedAt: TEST_NOW }, 409, 'media_already_attached'],
    ['purpose différent', { purpose: 'post' as const }, 422, 'media_purpose_mismatch'],
    ['vidéo', { kind: 'video' as const }, 422, 'media_kind_mismatch'],
  ])('%s → refus, aucun message créé', async (_label, overrides, status, code) => {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'message', ...overrides });
    const id = await conversationWith(B);

    const response = await sendPhoto(id);

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
    const history = await context.app.inject({
      url: `/v1/conversations/${id}/messages`,
      headers: await as(A),
    });
    expect(history.json<components['schemas']['MessagePage']>().items).toEqual([]);
  });

  it('média inexistant → 404 media_not_found', async () => {
    const response = await sendPhoto(await conversationWith(B));
    expect(response.json()).toMatchObject({ code: 'media_not_found' });
  });

  it('refuse une photo sans mediaId ou un texte avec mediaId', async () => {
    const id = await conversationWith(B);
    for (const payload of [
      { clientId: CLIENT, kind: 'image' },
      { clientId: CLIENT, kind: 'text', body: 'x', mediaId: PHOTO },
      { clientId: CLIENT, kind: 'image', mediaId: PHOTO, body: '' },
    ]) {
      const response = await context.app.inject({
        method: 'POST',
        url: `/v1/conversations/${id}/messages`,
        headers: await as(A),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('GET /v1/media/{id}/signed-url', () => {
  async function sentPhoto() {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'message' });
    await sendPhoto(await conversationWith(B));
  }

  it('URL signée valable 1 h pour les deux membres de la conversation', async () => {
    await sentPhoto();

    for (const viewer of [A, B]) {
      const response = await signedUrl(viewer, '?variant=medium');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        url: `https://storage.test/sign/media-private/${PHOTO}/medium.webp?token=test`,
        expiresAt: new Date(TEST_NOW.getTime() + 60 * 60 * 1000).toISOString(),
      });
    }
  });

  it('média d’une autre conversation → 404 media_not_found', async () => {
    await sentPhoto();
    await conversationWith(C);

    const response = await signedUrl(C);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'media_not_found' });
  });

  it('compte bloqué après l’envoi → 404 pour les deux membres, rétabli au déblocage', async () => {
    await sentPhoto();
    await context.app.inject({ method: 'PUT', url: `/v1/users/${A}/block`, headers: await as(B) });

    expect((await signedUrl(A)).json()).toMatchObject({ code: 'media_not_found' });
    expect((await signedUrl(B)).statusCode).toBe(404);

    await context.app.inject({
      method: 'DELETE',
      url: `/v1/users/${A}/block`,
      headers: await as(B),
    });
    expect((await signedUrl(B)).statusCode).toBe(200);
  });

  it('média pas encore envoyé, même par son propriétaire → 404', async () => {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'message' });
    expect((await signedUrl(A)).statusCode).toBe(404);
  });

  it('média public (photo de profil) → 404 : aucune URL signée hors des messages', async () => {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'avatar', attachedAt: TEST_NOW });
    expect((await signedUrl(A)).statusCode).toBe(404);
  });

  it('variante absente ou inconnue → 400', async () => {
    await sentPhoto();
    expect((await signedUrl(A, '')).statusCode).toBe(400);
    expect((await signedUrl(A, '?variant=huge')).statusCode).toBe(400);
  });
});

describe('GET /v1/media/{id} (photo de message)', () => {
  it('ne renvoie jamais d’URL publique pour une photo de message', async () => {
    context.media.addReady({ id: PHOTO, ownerId: A, purpose: 'message' });

    const response = await context.app.inject({ url: `/v1/media/${PHOTO}`, headers: await as(A) });

    expect(response.json()).toEqual({
      id: PHOTO,
      kind: 'image',
      purpose: 'message',
      status: 'ready',
    });
  });
});

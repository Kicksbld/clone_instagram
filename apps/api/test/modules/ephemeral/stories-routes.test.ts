import type { components } from '@clone/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, TEST_MEDIA_BASE_URL, TEST_NOW } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const FRIEND = '0199a1b2-0000-7000-8000-000000000002';
const FOLLOWER = '0199a1b2-0000-7000-8000-000000000003';
const STRANGER = '0199a1b2-0000-7000-8000-000000000004';
const UNKNOWN_STORY = '0199a1b2-0000-7000-e100-999999999999';
const HOUR = 60 * 60 * 1000;

let context: ReturnType<typeof buildTestApp>;
const tokens = new Map<string, string>();

beforeEach(async () => {
  context = buildTestApp();
  for (const [id, username] of [
    [ME, 'killian'],
    [FRIEND, 'bruno'],
    [FOLLOWER, 'chloe'],
    [STRANGER, 'david'],
  ] as const) {
    context.profiles.add({ id, username });
    tokens.set(id, `Bearer ${await signTestToken(id)}`);
  }
});

afterEach(async () => {
  await context.app.close();
});

const as = (userId: string) => ({ authorization: tokens.get(userId) ?? '' });
const request = (
  userId: string,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: object,
) =>
  context.app.inject({
    method,
    url,
    headers: as(userId),
    ...(payload !== undefined && { payload }),
  });

let mediaCounter = 0;
function givenPhoto(ownerId: string, values: { purpose?: 'story' | 'post'; kind?: 'video' } = {}) {
  const id = `0199a1b2-0000-7000-d000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({
    id,
    ownerId,
    purpose: values.purpose ?? 'story',
    kind: values.kind ?? 'image',
  });
  return id;
}

async function publish(
  authorId: string,
  audience: 'everyone' | 'close_friends' = 'everyone',
): Promise<string> {
  const response = await request(authorId, 'POST', '/v1/stories', {
    mediaId: givenPhoto(authorId),
    audience,
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

/** Story de `authorId` publiée `hoursAgo` heures avant `TEST_NOW`, active `durationHours`. */
function givenPastStory(authorId: string, hoursAgo: number, durationHours = 24): string {
  const id = `0199a1b2-0000-7000-a000-${String(++mediaCounter).padStart(12, '0')}`;
  const createdAt = new Date(TEST_NOW.getTime() - hoursAgo * HOUR);
  void context.stories.create({
    id,
    authorId,
    mediaId: givenPhoto(authorId),
    audience: 'everyone',
    createdAt,
    expiresAt: new Date(createdAt.getTime() + durationHours * HOUR),
  });
  return id;
}

function givenPlus(userId: string, expiresAt = new Date(TEST_NOW.getTime() + 30 * 24 * HOUR)) {
  context.subscriptions.rows.set(userId, {
    userId,
    status: 'active',
    productId: 'clone.plus.monthly',
    expiresAt,
    refreshedAt: TEST_NOW,
  });
}

const storiesOf = async (viewerId: string, authorId: string) =>
  (await request(viewerId, 'GET', `/v1/users/${authorId}/stories`)).json<{
    items: { id: string; audience: string; viewerHasSeen: boolean; expiresAt: string }[];
  }>().items;

const tray = async (viewerId: string) => {
  const response = await request(viewerId, 'GET', '/v1/stories/tray');
  expect(response.statusCode).toBe(200);
  return response.json<{
    items: { author: { id: string }; seen: boolean; hasCloseFriendsStory: boolean }[];
  }>().items;
};

describe('POST /v1/stories', () => {
  it('publie une photo pour tout le monde → 201, active 24 h, média rattaché', async () => {
    const mediaId = givenPhoto(ME);

    const response = await request(ME, 'POST', '/v1/stories', { mediaId, audience: 'everyone' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: '0199a1b2-0000-7000-e100-000000000001',
      author: { id: ME, username: 'killian' },
      audience: 'everyone',
      media: {
        variants: {
          thumb: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${mediaId}/thumb.webp`,
          medium: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${mediaId}/medium.webp`,
          large: `${TEST_MEDIA_BASE_URL}/storage/v1/object/public/media-public/${mediaId}/large.webp`,
        },
        width: 1080,
        height: 1350,
      },
      viewerHasSeen: true,
      createdAt: '2026-09-25T12:00:00.000Z',
      expiresAt: '2026-09-26T12:00:00.000Z',
    });
    expect(context.media.rows.get(mediaId)?.attachedAt).not.toBeNull();
  });

  it('abonné Plus → active 48 h, et le reste après l’expiration de son abonnement', async () => {
    givenPlus(ME);
    const id = await publish(ME);

    givenPlus(ME, new Date(TEST_NOW.getTime() - HOUR));

    const [story] = await storiesOf(ME, ME);
    expect(story).toMatchObject({ id, expiresAt: '2026-09-27T12:00:00.000Z' });
  });

  it('média d’un autre utilisateur → 404 media_not_found', async () => {
    const response = await request(ME, 'POST', '/v1/stories', {
      mediaId: givenPhoto(FRIEND),
      audience: 'everyone',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'media_not_found' });
  });

  it('média déjà rattaché → 409 media_already_attached', async () => {
    const mediaId = givenPhoto(ME);
    await request(ME, 'POST', '/v1/stories', { mediaId, audience: 'everyone' });

    const response = await request(ME, 'POST', '/v1/stories', { mediaId, audience: 'everyone' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'media_already_attached' });
  });

  it('vidéo → 422 media_kind_mismatch ; photo de post → 422 media_purpose_mismatch', async () => {
    const video = await request(ME, 'POST', '/v1/stories', {
      mediaId: givenPhoto(ME, { kind: 'video' }),
      audience: 'everyone',
    });
    const post = await request(ME, 'POST', '/v1/stories', {
      mediaId: givenPhoto(ME, { purpose: 'post' }),
      audience: 'everyone',
    });

    expect(video.statusCode).toBe(422);
    expect(video.json()).toMatchObject({ code: 'media_kind_mismatch' });
    expect(post.statusCode).toBe(422);
    expect(post.json()).toMatchObject({ code: 'media_purpose_mismatch' });
  });

  it('audience inconnue ou champ en trop → 400', async () => {
    const mediaId = givenPhoto(ME);

    for (const body of [
      { mediaId, audience: 'mutuals' },
      { mediaId, audience: 'everyone', mentionedUserIds: [] },
    ]) {
      const response = await request(ME, 'POST', '/v1/stories', body);
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('GET /v1/users/{id}/stories', () => {
  it('story amis proches : vue par un ami proche, pas par un abonné qui ne l’est pas', async () => {
    context.relationships.follow(FRIEND, ME);
    context.relationships.follow(FOLLOWER, ME);
    context.relationships.addCloseFriend(ME, FRIEND);
    const everyone = await publish(ME, 'everyone');
    const closeFriends = await publish(ME, 'close_friends');

    expect((await storiesOf(FRIEND, ME)).map((story) => story.id)).toEqual([
      everyone,
      closeFriends,
    ]);
    expect((await storiesOf(FOLLOWER, ME)).map((story) => story.id)).toEqual([everyone]);
    expect((await storiesOf(ME, ME)).map((story) => story.id)).toEqual([everyone, closeFriends]);
  });

  it('retiré des amis proches → perd aussitôt l’accès à la story amis proches', async () => {
    context.relationships.follow(FRIEND, ME);
    context.relationships.addCloseFriend(ME, FRIEND);
    await publish(ME, 'close_friends');

    context.relationships.removeCloseFriend(ME, FRIEND);

    expect(await storiesOf(FRIEND, ME)).toEqual([]);
  });

  it('story expirée : absente pour les autres', async () => {
    givenPastStory(ME, 25);
    const active = givenPastStory(ME, 2);

    expect((await storiesOf(STRANGER, ME)).map((story) => story.id)).toEqual([active]);
  });

  it('auteur bloqué ou compte privé non suivi → 404 user_not_found', async () => {
    await publish(ME);
    context.relationships.block(ME, STRANGER);
    context.profiles.add({ id: FRIEND, username: 'bruno', isPrivate: true });
    await publish(FRIEND);

    for (const [viewer, author] of [
      [STRANGER, ME],
      [FOLLOWER, FRIEND],
    ] as const) {
      const response = await request(viewer, 'GET', `/v1/users/${author}/stories`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'user_not_found' });
    }
  });
});

describe('POST /v1/stories/{id}/view', () => {
  it('vue d’une story visible → 204, puis vue ; une seconde vue → 204', async () => {
    const id = await publish(ME);

    expect((await request(FOLLOWER, 'POST', `/v1/stories/${id}/view`, {})).statusCode).toBe(204);
    expect(
      (await request(FOLLOWER, 'POST', `/v1/stories/${id}/view`, { anonymous: false })).statusCode,
    ).toBe(204);

    expect(await storiesOf(FOLLOWER, ME)).toMatchObject([{ id, viewerHasSeen: true }]);
  });

  it('vue anonyme sans Plus → 403 plus_required', async () => {
    const id = await publish(ME);

    const response = await request(FOLLOWER, 'POST', `/v1/stories/${id}/view`, {
      anonymous: true,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'plus_required' });
  });

  it('story invisible, expirée, inexistante ou d’un auteur bloqué → 404 story_not_found', async () => {
    context.relationships.follow(FOLLOWER, ME);
    const closeFriends = await publish(ME, 'close_friends');
    const expired = givenPastStory(ME, 30);
    const blockedAuthor = await publish(FRIEND);
    context.relationships.block(FRIEND, FOLLOWER);

    for (const id of [closeFriends, expired, blockedAuthor, UNKNOWN_STORY]) {
      const response = await request(FOLLOWER, 'POST', `/v1/stories/${id}/view`, {});
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'story_not_found' });
    }
  });
});

describe('DELETE /v1/stories/{id}', () => {
  it('supprime ma story → 204, disparaît des lectures, média détaché', async () => {
    const id = await publish(ME);
    const mediaId = context.stories.rows.get(id)?.mediaId ?? '';

    const response = await request(ME, 'DELETE', `/v1/stories/${id}`);

    expect(response.statusCode).toBe(204);
    expect(await storiesOf(FOLLOWER, ME)).toEqual([]);
    expect(context.media.rows.get(mediaId)?.detachedAt).not.toBeNull();
  });

  it('ma story expirée (archivée) se supprime aussi → 204', async () => {
    const id = givenPastStory(ME, 30);

    expect((await request(ME, 'DELETE', `/v1/stories/${id}`)).statusCode).toBe(204);
  });

  it('story d’un autre, déjà supprimée ou inexistante → 404 story_not_found', async () => {
    const id = await publish(ME);
    await request(ME, 'DELETE', `/v1/stories/${id}`);
    const other = await publish(FRIEND);

    for (const [userId, storyId] of [
      [ME, id],
      [ME, other],
      [ME, UNKNOWN_STORY],
    ] as const) {
      const response = await request(userId, 'DELETE', `/v1/stories/${storyId}`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'story_not_found' });
    }
  });
});

describe('GET /v1/stories/tray', () => {
  it('ma story d’abord, puis les non vues, puis les vues, chaque groupe du plus récent au plus ancien', async () => {
    for (const author of [FRIEND, FOLLOWER, STRANGER]) context.relationships.follow(ME, author);
    const seenRecent = givenPastStory(FRIEND, 1);
    givenPastStory(FOLLOWER, 3);
    givenPastStory(STRANGER, 2);
    givenPastStory(ME, 5);
    await request(ME, 'POST', `/v1/stories/${seenRecent}/view`, {});

    expect((await tray(ME)).map((entry) => [entry.author.id, entry.seen])).toEqual([
      [ME, true],
      [STRANGER, false],
      [FOLLOWER, false],
      [FRIEND, true],
    ]);
  });

  it('un auteur n’est vu que quand toutes ses stories visibles sont vues', async () => {
    context.relationships.follow(ME, FRIEND);
    const first = givenPastStory(FRIEND, 3);
    givenPastStory(FRIEND, 2);
    await request(ME, 'POST', `/v1/stories/${first}/view`, {});

    expect(await tray(ME)).toMatchObject([{ author: { id: FRIEND }, seen: false }]);
  });

  it('seulement les comptes suivis ; ni auteur bloqué, ni story expirée', async () => {
    context.relationships.follow(ME, FRIEND);
    context.relationships.follow(ME, FOLLOWER);
    await publish(STRANGER);
    await publish(FRIEND);
    givenPastStory(FOLLOWER, 26);
    context.relationships.block(FRIEND, ME);

    expect(await tray(ME)).toEqual([]);
  });

  it('démo : A publie pour ses amis proches, B (ami proche) la voit, C (abonné) non', async () => {
    context.relationships.follow(FRIEND, ME);
    context.relationships.follow(FOLLOWER, ME);
    context.relationships.addCloseFriend(ME, FRIEND);
    await publish(ME, 'close_friends');

    expect(await tray(FRIEND)).toMatchObject([
      { author: { id: ME }, seen: false, hasCloseFriendsStory: true },
    ]);
    expect(await tray(FOLLOWER)).toEqual([]);
    expect(await tray(ME)).toMatchObject([
      { author: { id: ME }, seen: true, hasCloseFriendsStory: true },
    ]);
  });
});

describe('Vues T25', () => {
  it('Plus regarde anonymement sans vue ; seul l’auteur consulte les vues', async () => {
    const id = await publish(ME);
    givenPlus(FRIEND);
    expect(
      (await request(FRIEND, 'POST', `/v1/stories/${id}/view`, { anonymous: true })).statusCode,
    ).toBe(204);
    await request(FOLLOWER, 'POST', `/v1/stories/${id}/view`, {});
    const response = await request(ME, 'GET', `/v1/stories/${id}/viewers`);
    expect(response.statusCode).toBe(200);
    expect(response.json<components['schemas']['StoryViewerPage']>()).toMatchObject({
      items: [{ viewer: { id: FOLLOWER, username: 'chloe' }, viewedAt: TEST_NOW.toISOString() }],
    });
    expect(response.json<components['schemas']['StoryViewerPage']>().items).toHaveLength(1);
    expect(context.stories.rows.get(id)?.viewCount).toBe(1);
    expect((await request(FRIEND, 'GET', `/v1/stories/${id}/viewers`)).statusCode).toBe(404);
  });
});

describe('Archive T25', () => {
  it('mes stories expirées seulement, récentes en premier ; vues conservées et suppression respectée', async () => {
    const older = givenPastStory(ME, 40);
    const recent = givenPastStory(ME, 30);
    const deleted = givenPastStory(ME, 26);
    givenPastStory(FRIEND, 28);
    await publish(ME);
    await context.stories.recordView(recent, FOLLOWER, TEST_NOW);
    await request(ME, 'DELETE', `/v1/stories/${deleted}`);
    const response = await request(ME, 'GET', '/v1/me/stories/archive');
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json<components['schemas']['ArchivedStoryPage']>()
        .items.map((s: { id: string }) => s.id),
    ).toEqual([recent, older]);
    expect(
      (await request(ME, 'GET', `/v1/stories/${recent}/viewers`)).json<
        components['schemas']['StoryViewerPage']
      >().items,
    ).toMatchObject([{ viewer: { id: FOLLOWER } }]);
    expect((await request(FRIEND, 'GET', `/v1/stories/${recent}/viewers`)).statusCode).toBe(404);
  });
});

describe('Règles de lecture T25', () => {
  it('recherche par username ou nom réservée à Plus, même q vide ; abonnement expiré refusé', async () => {
    const id = await publish(ME);
    await request(FOLLOWER, 'POST', `/v1/stories/${id}/view`, {});
    for (const q of ['', 'chloe']) {
      const response = await request(ME, 'GET', `/v1/stories/${id}/viewers?q=${q}`);
      expect(response.statusCode).toBe(403);
      expect(response.json<components['schemas']['StoryViewerPage']>()).toMatchObject({
        code: 'plus_required',
      });
    }
    givenPlus(ME);
    expect(
      (await request(ME, 'GET', `/v1/stories/${id}/viewers?q=CHL`)).json<
        components['schemas']['StoryViewerPage']
      >().items,
    ).toHaveLength(1);
    expect(
      (await request(ME, 'GET', `/v1/stories/${id}/viewers?q=absent`)).json<
        components['schemas']['StoryViewerPage']
      >().items,
    ).toEqual([]);
    givenPlus(ME, new Date(TEST_NOW.getTime() - HOUR));
    expect((await request(ME, 'GET', `/v1/stories/${id}/viewers?q=chloe`)).statusCode).toBe(403);
    expect(
      (await request(ME, 'POST', `/v1/stories/${id}/view`, { anonymous: true })).statusCode,
    ).toBe(403);
  });

  it('comptes bloqués après leur vue et comptes non actifs exclus ; story supprimée indisponible', async () => {
    const id = await publish(ME);
    for (const viewer of [FRIEND, FOLLOWER, STRANGER])
      await request(viewer, 'POST', `/v1/stories/${id}/view`, {});
    context.relationships.block(FRIEND, ME);
    context.relationships.block(ME, STRANGER);
    const follower = context.profiles.rows.get(FOLLOWER);
    if (follower) follower.status = 'suspended';
    expect(
      (await request(ME, 'GET', `/v1/stories/${id}/viewers`)).json<
        components['schemas']['StoryViewerPage']
      >().items,
    ).toEqual([]);
    await request(ME, 'DELETE', `/v1/stories/${id}`);
    expect((await request(ME, 'GET', `/v1/stories/${id}/viewers`)).statusCode).toBe(404);
  });

  it('vue anonyme Plus respecte les amis proches et le blocage', async () => {
    givenPlus(FRIEND);
    const id = await publish(ME, 'close_friends');
    expect(
      (await request(FRIEND, 'POST', `/v1/stories/${id}/view`, { anonymous: true })).statusCode,
    ).toBe(404);
    context.relationships.addCloseFriend(ME, FRIEND);
    expect(
      (await request(FRIEND, 'POST', `/v1/stories/${id}/view`, { anonymous: true })).statusCode,
    ).toBe(204);
    context.relationships.block(ME, FRIEND);
    expect(
      (await request(FRIEND, 'POST', `/v1/stories/${id}/view`, { anonymous: true })).statusCode,
    ).toBe(404);
  });

  it('curseurs invalides rejetés sur les deux listes ; routes authentifiées', async () => {
    const id = await publish(ME);
    for (const path of [`/v1/stories/${id}/viewers`, '/v1/me/stories/archive']) {
      expect((await request(ME, 'GET', `${path}?cursor=invalid`)).statusCode).toBe(400);
      expect((await context.app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
    }
  });

  it('archive paginée sans doublon lorsque les dates sont égales', async () => {
    const ids = Array.from({ length: 21 }, () => givenPastStory(ME, 30)).reverse();
    const first = (await request(ME, 'GET', '/v1/me/stories/archive')).json<
      components['schemas']['ArchivedStoryPage']
    >();
    expect(first.items.map((s: { id: string }) => s.id)).toEqual(ids.slice(0, 20));
    const second = (
      await request(
        ME,
        'GET',
        `/v1/me/stories/archive?cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      )
    ).json<components['schemas']['ArchivedStoryPage']>();
    expect(second.items.map((s: { id: string }) => s.id)).toEqual(ids.slice(20));
    expect(second.nextCursor).toBeUndefined();
  });
});

import {
  blocks,
  closeFriends,
  follows,
  media,
  newId,
  profiles,
  stories,
  type Executor,
} from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DeleteStory } from '../../../src/modules/ephemeral/application/use-cases/delete-story.ts';
import { PublishStory } from '../../../src/modules/ephemeral/application/use-cases/publish-story.ts';
import { ViewStory } from '../../../src/modules/ephemeral/application/use-cases/view-story.ts';
import {
  DrizzleStoryReader,
  DrizzleStoryRepository,
} from '../../../src/modules/ephemeral/infrastructure/persistence/drizzle-stories.ts';
import { DrizzleMediaRepository } from '../../../src/modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { uuidV7Generator } from '../../../src/shared/infrastructure/uuid-v7-generator.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const reader = new DrizzleStoryReader(db);
const created: string[] = [];
const HOUR = 60 * 60 * 1000;
let now = Date.parse('2026-09-25T12:00:00.000Z');
const clock = { now: () => new Date(now) };
let plus = false;

const publishStory = new PublishStory(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    accounts: new DrizzleAccountReader(tx),
    media: new DrizzleMediaRepository(tx),
    stories: new DrizzleStoryRepository(tx),
    reader: new DrizzleStoryReader(tx),
  })),
  { isPlus: () => Promise.resolve(plus) },
  uuidV7Generator,
  clock,
);
const viewStory = new ViewStory(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    relationships: new DrizzleRelationshipReader(tx),
    reader: new DrizzleStoryReader(tx),
    stories: new DrizzleStoryRepository(tx),
  })),
  clock,
);
const deleteStory = new DeleteStory(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    media: new DrizzleMediaRepository(tx),
    stories: new DrizzleStoryRepository(tx),
  })),
);

afterEach(async () => {
  plus = false;
  now = Date.parse('2026-09-25T12:00:00.000Z');
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function givenProfile(values: { isPrivate?: boolean; status?: 'banned' } = {}) {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `t_${id.replaceAll('-', '').slice(-20)}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
    ...values,
  });
  return id;
}

/** Photo de profil `ready` posée sur le compte (comme après `PATCH /v1/me`). */
async function givenAvatar(profileId: string): Promise<string> {
  const id = await givenPhoto(profileId);
  await db.update(media).set({ purpose: 'avatar' }).where(eq(media.id, id));
  await db.update(profiles).set({ avatarMediaId: id }).where(eq(profiles.id, profileId));
  return id;
}

async function givenPhoto(ownerId: string): Promise<string> {
  const id = newId();
  await db.insert(media).values({
    id,
    ownerId,
    kind: 'image',
    purpose: 'story',
    status: 'ready',
    originalPath: `${ownerId}/${id}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    width: 1080,
    height: 1920,
    variants: { thumb: `${id}/t.webp`, medium: `${id}/m.webp`, large: `${id}/l.webp` },
  });
  return id;
}

/** Story publiée `hoursAgo` heures avant l'horloge du test. */
async function givenStory(
  authorId: string,
  hoursAgo = 0,
  audience: 'everyone' | 'close_friends' = 'everyone',
): Promise<string> {
  const saved = now;
  now -= hoursAgo * HOUR;
  const story = await publishStory.execute({
    authorId,
    mediaId: await givenPhoto(authorId),
    audience,
  });
  now = saved;
  return story.id;
}

const follow = (followerId: string, followeeId: string) =>
  db.insert(follows).values({ followerId, followeeId });
const trayOf = async (viewerId: string) =>
  (await reader.tray(viewerId, clock.now(), 100)).map((entry) => ({
    id: entry.author.id,
    seen: entry.seen,
    closeFriends: entry.hasCloseFriendsStory,
  }));

describe('PublishStory sur Postgres', () => {
  it('24 h, 48 h pour un abonné Plus ; photo et dimensions renvoyées', async () => {
    const author = await givenProfile();
    const story = await publishStory.execute({
      authorId: author,
      mediaId: await givenPhoto(author),
      audience: 'close_friends',
    });
    plus = true;
    const plusStory = await publishStory.execute({
      authorId: author,
      mediaId: await givenPhoto(author),
      audience: 'everyone',
    });

    expect(story).toMatchObject({
      audience: 'close_friends',
      viewerHasSeen: true,
      media: { width: 1080, height: 1920 },
      expiresAt: new Date('2026-09-26T12:00:00.000Z'),
    });
    expect(plusStory.expiresAt).toEqual(new Date('2026-09-27T12:00:00.000Z'));
  });
});

describe('Auteur avec une photo de profil', () => {
  it('publication, stories de l’auteur et bandeau renvoient ses variantes', async () => {
    const author = await givenProfile();
    const viewer = await givenProfile();
    const avatarId = await givenAvatar(author);
    await follow(viewer, author);
    const expected = {
      thumb: `${avatarId}/t.webp`,
      medium: `${avatarId}/m.webp`,
      large: `${avatarId}/l.webp`,
    };

    const story = await publishStory.execute({
      authorId: author,
      mediaId: await givenPhoto(author),
      audience: 'everyone',
    });
    const listed = await reader.listActiveByAuthor(author, viewer, clock.now());
    const tray = await reader.tray(viewer, clock.now(), 100);

    expect(story.author.avatarVariants).toEqual(expected);
    expect(listed[0]?.author.avatarVariants).toEqual(expected);
    expect(tray[0]?.author.avatarVariants).toEqual(expected);
  });
});

describe('DrizzleStoryReader', () => {
  it('stories actives d’un auteur, de la plus ancienne à la plus récente, sans expirées ni supprimées', async () => {
    const author = await givenProfile();
    await givenStory(author, 30);
    const older = await givenStory(author, 5);
    const deleted = await givenStory(author, 3);
    const recent = await givenStory(author, 1);
    await deleteStory.execute({ authorId: author, storyId: deleted });

    const list = await reader.listActiveByAuthor(author, author, clock.now());

    expect(list.map((story) => story.id)).toEqual([older, recent]);
  });

  it('bandeau : moi d’abord, puis non vus, puis vus ; comptes suivis seulement', async () => {
    const me = await givenProfile();
    const [seen, unseenOld, unseenRecent, notFollowed] = [
      await givenProfile(),
      await givenProfile(),
      await givenProfile(),
      await givenProfile(),
    ];
    for (const author of [seen, unseenOld, unseenRecent]) await follow(me, author);
    const seenStory = await givenStory(seen, 1);
    await givenStory(unseenOld, 4);
    await givenStory(unseenRecent, 2);
    await givenStory(notFollowed, 1);
    await givenStory(me, 6);
    await viewStory.execute({ viewerId: me, storyId: seenStory });

    expect(await trayOf(me)).toEqual([
      { id: me, seen: true, closeFriends: false },
      { id: unseenRecent, seen: false, closeFriends: false },
      { id: unseenOld, seen: false, closeFriends: false },
      { id: seen, seen: true, closeFriends: false },
    ]);
  });

  it('bandeau : audience amis proches, blocage, compte non actif et story expirée appliqués en SQL', async () => {
    const me = await givenProfile();
    const [friendOf, notFriendOf, blocker, banned, expired, privateFollowed] = [
      await givenProfile(),
      await givenProfile(),
      await givenProfile(),
      await givenProfile({ status: 'banned' }),
      await givenProfile(),
      await givenProfile({ isPrivate: true }),
    ];
    for (const author of [friendOf, notFriendOf, blocker, banned, expired, privateFollowed])
      await follow(me, author);
    await db.insert(closeFriends).values({ ownerId: friendOf, friendId: me });
    await db.insert(blocks).values({ blockerId: blocker, blockedId: me });
    await givenStory(friendOf, 1, 'close_friends');
    await givenStory(notFriendOf, 1, 'close_friends');
    await givenStory(blocker, 1);
    await givenStory(banned, 1);
    await givenStory(expired, 25);
    await givenStory(privateFollowed, 2);

    expect(await trayOf(me)).toEqual([
      { id: friendOf, seen: false, closeFriends: true },
      { id: privateFollowed, seen: false, closeFriends: false },
    ]);
  });
});

describe('DrizzleStoryRepository', () => {
  it('vue en double : une ligne, view_count à 1 ; l’auteur n’est pas compté', async () => {
    const author = await givenProfile();
    const viewer = await givenProfile();
    const storyId = await givenStory(author);

    await viewStory.execute({ viewerId: viewer, storyId });
    await viewStory.execute({ viewerId: viewer, storyId });
    await viewStory.execute({ viewerId: author, storyId });

    const [row] = await db.select().from(stories).where(eq(stories.id, storyId));
    expect(row?.viewCount).toBe(1);
    expect((await reader.findActive(storyId, viewer, clock.now()))?.viewerHasSeen).toBe(true);
  });

  it('suppression : une seule fois, média détaché', async () => {
    const author = await givenProfile();
    const storyId = await givenStory(author);
    const [row] = await db.select().from(stories).where(eq(stories.id, storyId));

    await deleteStory.execute({ authorId: author, storyId });
    const again = new DrizzleStoryRepository(db).softDelete(storyId, author);

    await expect(again).resolves.toBeNull();
    const [photo] = await db
      .select({ detachedAt: media.detachedAt })
      .from(media)
      .where(eq(media.id, row?.mediaId ?? ''));
    expect(photo?.detachedAt).not.toBeNull();
  });
});

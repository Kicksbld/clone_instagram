import { randomBytes } from 'node:crypto';

import {
  closeFriends,
  comments,
  follows,
  media,
  newId,
  postMedia,
  posts,
  profiles,
  type Executor,
  type NewProfileRow,
} from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleNotificationWriter } from '../../../src/modules/activity/infrastructure/persistence/drizzle-notification-writer.ts';
import { DrizzleCommentReader } from '../../../src/modules/engagement/infrastructure/persistence/drizzle-comments.ts';
import { DrizzleFeedReader } from '../../../src/modules/feed/infrastructure/persistence/drizzle-feed-reader.ts';
import { BlockUser } from '../../../src/modules/social/application/use-cases/block-user.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { DrizzleBlockRepository } from '../../../src/modules/social/infrastructure/persistence/drizzle-block-repository.ts';
import { DrizzleCloseFriendRepository } from '../../../src/modules/social/infrastructure/persistence/drizzle-close-friend-repository.ts';
import {
  DrizzleFollowCounters,
  DrizzleFollowRepository,
} from '../../../src/modules/social/infrastructure/persistence/drizzle-follow-repository.ts';
import { DrizzleFollowRequestRepository } from '../../../src/modules/social/infrastructure/persistence/drizzle-follow-request-repository.ts';
import { DrizzleSocialGraphReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-social-graph-reader.ts';
import { canViewProfile } from '../../../src/shared/domain/visibility.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const blockRepository = new DrizzleBlockRepository(db);
const closeFriendRepository = new DrizzleCloseFriendRepository(db);
const graph = new DrizzleSocialGraphReader(db);
const accounts = new DrizzleAccountReader(db);
const relationships = new DrizzleRelationshipReader(db);
const feed = new DrizzleFeedReader(db);
const commentReader = new DrizzleCommentReader(db);
const blockUser = new BlockUser(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    accounts: new DrizzleAccountReader(tx),
    relationships: new DrizzleRelationshipReader(tx),
    blocks: new DrizzleBlockRepository(tx),
    follows: new DrizzleFollowRepository(tx),
    requests: new DrizzleFollowRequestRepository(tx),
    closeFriends: new DrizzleCloseFriendRepository(tx),
    counters: new DrizzleFollowCounters(tx),
    notifications: new DrizzleNotificationWriter(tx),
  })),
);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, commentaires, abonnements et blocages (cascade).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function newProfile(
  suffix: string,
  fields: Partial<Omit<NewProfileRow, 'id' | 'username'>> = {},
): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
    ...fields,
  });
  return id;
}

async function newPost(authorId: string): Promise<string> {
  const mediaId = newId();
  await db.insert(media).values({
    id: mediaId,
    ownerId: authorId,
    kind: 'image',
    purpose: 'post',
    status: 'ready',
    originalPath: `${authorId}/${mediaId}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    width: 1080,
    height: 1350,
    variants: {
      thumb: `${mediaId}/thumb.webp`,
      medium: `${mediaId}/medium.webp`,
      large: `${mediaId}/large.webp`,
    },
    attachedAt: new Date(),
  });
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post', caption: '' });
  await db.insert(postMedia).values({ postId: id, mediaId, position: 0 });
  return id;
}

async function newComment(postId: string, authorId: string): Promise<string> {
  const id = newId();
  await db.insert(comments).values({ id, postId, authorId, body: 'Commentaire' });
  return id;
}

async function followWithCounts(followerId: string, followeeId: string): Promise<void> {
  await db.insert(follows).values({ followerId, followeeId });
  await new DrizzleFollowCounters(db).apply(followerId, followeeId, 1);
}

async function countsOf(id: string) {
  const [row] = await db
    .select({ followerCount: profiles.followerCount, followingCount: profiles.followingCount })
    .from(profiles)
    .where(eq(profiles.id, id));
  return row;
}

describe('DrizzleBlockRepository', () => {
  it('has / add / remove, idempotents et orientés', async () => {
    const [a, b] = [await newProfile('a'), await newProfile('b')];

    await expect(blockRepository.add(a, b)).resolves.toBe(true);
    await expect(blockRepository.add(a, b)).resolves.toBe(false);
    await expect(blockRepository.has(a, b)).resolves.toBe(true);
    await expect(blockRepository.has(b, a)).resolves.toBe(false);
    await expect(blockRepository.remove(a, b)).resolves.toBe(true);
    await expect(blockRepository.remove(a, b)).resolves.toBe(false);
  });
});

describe('DrizzleCloseFriendRepository', () => {
  it('add / remove, idempotents et orientés', async () => {
    const [a, b] = [await newProfile('a'), await newProfile('b')];

    await expect(closeFriendRepository.add(a, b)).resolves.toBe(true);
    await expect(closeFriendRepository.add(a, b)).resolves.toBe(false);
    await expect(closeFriendRepository.remove(b, a)).resolves.toBe(false);
    await expect(closeFriendRepository.remove(a, b)).resolves.toBe(true);
    await expect(closeFriendRepository.remove(a, b)).resolves.toBe(false);
  });

  it('on ne s’ajoute pas soi-même (CHECK)', async () => {
    const a = await newProfile('a');
    await expect(closeFriendRepository.add(a, a)).rejects.toThrow();
  });
});

describe('DrizzleSocialGraphReader.listCloseFriends', () => {
  it('le plus récent en premier, comptes visibles seulement, pagination sans doublon', async () => {
    const me = await newProfile('me');
    const friends: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await newProfile(`f${i}`);
      friends.push(id);
      await closeFriendRepository.add(me, id);
    }
    const banned = await newProfile('banned', { status: 'banned' });
    await closeFriendRepository.add(me, banned);
    // Ligne restée malgré un blocage (écrite à la main) : filtrée par la visibilité, dans les deux sens.
    const [blockedByMe, blockingMe] = [await newProfile('bm'), await newProfile('bme')];
    await closeFriendRepository.add(me, blockedByMe);
    await closeFriendRepository.add(me, blockingMe);
    await blockRepository.add(me, blockedByMe);
    await blockRepository.add(blockingMe, me);
    // La liste d'un autre n'apparaît pas dans la mienne.
    await closeFriendRepository.add(friends[0] ?? '', me);

    const first = await graph.listCloseFriends({ viewerId: me, after: null, limit: 3 });
    const second = await graph.listCloseFriends({ viewerId: me, after: first.next, limit: 3 });

    const ids = [...first.items, ...second.items].map((user) => user.id);
    expect(ids).toEqual([...friends].reverse());
    expect(second.next).toBeNull();
  });
});

describe('BlockUser sur Postgres : amis proches', () => {
  it('retire des amis proches dans les deux sens, sans toucher aux autres', async () => {
    const [me, other, third] = [
      await newProfile('me'),
      await newProfile('other'),
      await newProfile('third'),
    ];
    await closeFriendRepository.add(me, other);
    await closeFriendRepository.add(other, me);
    await closeFriendRepository.add(me, third);

    await blockUser.execute({ viewerId: me, userId: other });

    const rows = await db
      .select({ ownerId: closeFriends.ownerId, friendId: closeFriends.friendId })
      .from(closeFriends)
      .where(inArray(closeFriends.ownerId, [me, other]));
    expect(rows).toEqual([{ ownerId: me, friendId: third }]);
  });
});

describe('DrizzleSocialGraphReader.listBlocked', () => {
  it('le plus récent en premier, comptes actifs seulement, pagination sans doublon', async () => {
    const me = await newProfile('me');
    const blocked: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await newProfile(`b${i}`);
      blocked.push(id);
      await blockRepository.add(me, id);
    }
    const banned = await newProfile('banned', { status: 'banned' });
    await blockRepository.add(me, banned);

    const first = await graph.listBlocked({ viewerId: me, after: null, limit: 3 });
    const second = await graph.listBlocked({ viewerId: me, after: first.next, limit: 3 });

    const ids = [...first.items, ...second.items].map((user) => user.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids)).toEqual(new Set(blocked));
    expect(first.items[0]?.id).toBe(blocked[3]);
    expect(second.next).toBeNull();
    expect(first.items[0]?.relationship).toEqual({
      following: false,
      followedBy: false,
      requested: false,
    });
  });
});

describe('BlockUser sur Postgres : non-régression de la visibilité (ADR-006)', () => {
  it('abonnements et compteurs supprimés, compte invisible partout dans les deux sens', async () => {
    const [me, other, third] = [
      await newProfile('me'),
      await newProfile('other'),
      await newProfile('third'),
    ];
    await followWithCounts(me, other);
    await followWithCounts(other, me);
    await followWithCounts(me, third);
    await followWithCounts(other, third);
    const otherPost = await newPost(other);
    const thirdPost = await newPost(third);
    const otherComment = await newComment(thirdPost, other);
    const myComment = await newComment(thirdPost, me);

    await blockUser.execute({ viewerId: me, userId: other });

    // Abonnements dans les deux sens supprimés, compteurs à jour.
    expect(await countsOf(me)).toEqual({ followerCount: 0, followingCount: 1 });
    expect(await countsOf(other)).toEqual({ followerCount: 0, followingCount: 1 });

    for (const [viewer, owner] of [
      [me, other],
      [other, me],
    ] as const) {
      // Profil.
      const account = await accounts.findById(owner);
      if (!account) throw new Error('compte absent');
      expect(canViewProfile(viewer, account, await relationships.between(viewer, owner))).toBe(
        false,
      );
      // Recherche.
      const results = await graph.search({ viewerId: viewer, query: RUN, limit: 30 });
      expect(results.map((user) => user.id)).not.toContain(owner);
      // Listes d'abonnés d'un tiers.
      const followers = await graph.listFollowers({
        ownerId: third,
        viewerId: viewer,
        after: null,
        limit: 20,
      });
      expect(followers.items.map((user) => user.id)).not.toContain(owner);
    }

    // Feed : le post du compte bloqué n'apparaît plus, même s'il était suivi.
    const myFeed = await feed.listFeed({ viewerId: me, after: null, limit: 50 });
    expect(myFeed.items.map((post) => post.id)).toEqual([thirdPost]);
    expect(myFeed.items.map((post) => post.id)).not.toContain(otherPost);

    // Commentaires : chacun ne voit plus ceux de l'autre.
    const query = { after: null, limit: 20 };
    const seenByMe = await commentReader.listByPost(thirdPost, { viewerId: me, ...query });
    expect(seenByMe.items.map((comment) => comment.id)).toEqual([myComment]);
    const seenByOther = await commentReader.listByPost(thirdPost, { viewerId: other, ...query });
    expect(seenByOther.items.map((comment) => comment.id)).toEqual([otherComment]);
  });
});

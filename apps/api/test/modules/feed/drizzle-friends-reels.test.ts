import { randomBytes } from 'node:crypto';

import {
  blocks,
  comments,
  follows,
  media,
  newId,
  postLikes,
  postMedia,
  posts,
  profiles,
  type NewProfileRow,
} from '@clone/db';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleFeedReader } from '../../../src/modules/feed/infrastructure/persistence/drizzle-feed-reader.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const feed = new DrizzleFeedReader(db);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `f${randomBytes(4).toString('hex')}`;
let counter = 0;
let clock = Date.parse('2026-09-25T12:00:00.000Z');
const tick = () => new Date((clock += 1000));

afterEach(async () => {
  // Supprimer les profils supprime posts, médias, J'aime, commentaires, abonnements et blocages.
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
    username: `${RUN}_${suffix}${++counter}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
    ...fields,
  });
  return id;
}

async function newPost(
  authorId: string,
  kind: 'post' | 'reel' = 'reel',
  createdAt = tick(),
): Promise<string> {
  const mediaId = newId();
  await db.insert(media).values({
    id: mediaId,
    ownerId: authorId,
    kind: kind === 'reel' ? 'video' : 'image',
    purpose: 'post',
    status: 'ready',
    originalPath: `${authorId}/${mediaId}`,
    mimeType: kind === 'reel' ? 'video/mp4' : 'image/jpeg',
    sizeBytes: 1000,
    width: 1080,
    height: 1920,
    variants:
      kind === 'reel'
        ? { hls: `${mediaId}/master.m3u8`, thumbnail: `${mediaId}/thumb.webp` }
        : {
            thumb: `${mediaId}/thumb.webp`,
            medium: `${mediaId}/medium.webp`,
            large: `${mediaId}/large.webp`,
          },
    attachedAt: createdAt,
  });
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind, caption: '', createdAt });
  await db.insert(postMedia).values({ postId: id, mediaId, position: 0 });
  return id;
}

const follow = (followerId: string, followeeId: string) =>
  db.insert(follows).values({ followerId, followeeId });
async function befriend(a: string, b: string) {
  await follow(a, b);
  await follow(b, a);
}
const like = (userId: string, postId: string, createdAt = tick()) =>
  db.insert(postLikes).values({ userId, postId, createdAt });
async function comment(authorId: string, postId: string, body: string, createdAt = tick()) {
  const id = newId();
  await db.insert(comments).values({ id, postId, authorId, body, createdAt });
  return id;
}

async function friendsTab(viewerId: string): Promise<string[]> {
  const page = await feed.listFriendsReels({ viewerId, after: null, limit: 50 });
  return page.items.map(({ post }) => post.id);
}

/** Lecteur, un ami et un compte public dont l'ami aime un reel. */
async function givenFriendLikingPublicReel() {
  const me = await newProfile('me');
  const friend = await newProfile('friend');
  const author = await newProfile('author');
  await befriend(me, friend);
  const reel = await newPost(author);
  await like(friend, reel);
  return { me, friend, author, reel };
}

describe('DrizzleFeedReader — onglet Amis (ADR-029)', () => {
  it('reels créés, aimés et commentés par mes amis, à la date de l’interaction la plus récente', async () => {
    const me = await newProfile('me');
    const [lea, hugo] = [await newProfile('lea'), await newProfile('hugo')];
    const stranger = await newProfile('stranger');
    await befriend(me, lea);
    await befriend(me, hugo);
    const author = await newProfile('author');
    const created = await newPost(lea);
    const liked = await newPost(author);
    const commented = await newPost(author);
    const ignored = await newPost(stranger);
    await like(stranger, ignored);
    await like(hugo, liked);
    await comment(hugo, commented, 'top');
    // Deuxième ami sur le même reel, plus tard : le reel remonte, une seule fois.
    const at = tick();
    await like(lea, liked, at);

    const page = await feed.listFriendsReels({ viewerId: me, after: null, limit: 10 });

    expect(page.items.map(({ post }) => post.id)).toEqual([liked, commented, created]);
    expect(page.items[0]?.activityAt).toEqual(at);
    expect(page.next).toBeNull();
  });

  it('interactions groupées par ami, dernier commentaire non supprimé', async () => {
    const me = await newProfile('me');
    const lea = await newProfile('lea');
    const hugo = await newProfile('hugo');
    await befriend(me, lea);
    await befriend(me, hugo);
    const reel = await newPost(lea);
    await like(lea, reel);
    await comment(lea, reel, 'premier');
    await comment(lea, reel, 'dernier');
    const removed = await comment(lea, reel, 'supprimé');
    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, removed));
    await like(hugo, reel);
    await like(me, reel);

    const rows = await feed.listFriendInteractions(me, [reel]);

    expect(
      rows
        .map(({ friend, kind, commentText }) => ({ friend: friend.id, kind, commentText }))
        .sort((a, b) => `${a.friend}${a.kind}`.localeCompare(`${b.friend}${b.kind}`)),
    ).toEqual(
      [
        { friend: lea, kind: 'created', commentText: undefined },
        { friend: lea, kind: 'liked', commentText: undefined },
        { friend: lea, kind: 'commented', commentText: 'dernier' },
        { friend: hugo, kind: 'liked', commentText: undefined },
      ].sort((a, b) => `${a.friend}${a.kind}`.localeCompare(`${b.friend}${b.kind}`)),
    );
  });

  it('J’aime retiré → le reel disparaît', async () => {
    const { me, friend, reel } = await givenFriendLikingPublicReel();
    expect(await friendsTab(me)).toEqual([reel]);

    await db.delete(postLikes).where(and(eq(postLikes.userId, friend), eq(postLikes.postId, reel)));

    expect(await friendsTab(me)).toEqual([]);
  });

  it('commentaire supprimé → le reel disparaît', async () => {
    const me = await newProfile('me');
    const friend = await newProfile('friend');
    await befriend(me, friend);
    const reel = await newPost(await newProfile('author'));
    const id = await comment(friend, reel, 'hello');
    expect(await friendsTab(me)).toEqual([reel]);

    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, id));

    expect(await friendsTab(me)).toEqual([]);
  });

  it('ami passé à `nobody` : ses J’aime et commentaires disparaissent, ses reels restent', async () => {
    const { me, friend, reel } = await givenFriendLikingPublicReel();
    const commented = await newPost(await newProfile('other'));
    await comment(friend, commented, 'hello');
    const own = await newPost(friend);

    await db.update(profiles).set({ friendsTabActivity: 'nobody' }).where(eq(profiles.id, friend));

    expect(await friendsTab(me)).toEqual([own]);
    expect(await feed.listFriendInteractions(me, [reel, commented])).toEqual([]);
  });

  it('abonnement mutuel rompu → plus d’interactions', async () => {
    const { me, friend } = await givenFriendLikingPublicReel();
    await newPost(friend);

    await db.delete(follows).where(and(eq(follows.followerId, friend), eq(follows.followeeId, me)));

    expect(await friendsTab(me)).toEqual([]);
  });

  it('reel d’un compte privé que je ne suis pas, aimé par un ami → absent ; suivi → présent', async () => {
    const me = await newProfile('me');
    const friend = await newProfile('friend');
    const author = await newProfile('private', { isPrivate: true });
    await befriend(me, friend);
    const reel = await newPost(author);
    await like(friend, reel);
    expect(await friendsTab(me)).toEqual([]);

    await follow(me, author);

    expect(await friendsTab(me)).toEqual([reel]);
  });

  it.each([
    ['ami que j’ai bloqué', 'me-friend'],
    ['ami qui m’a bloqué', 'friend-me'],
    ['auteur que j’ai bloqué', 'me-author'],
    ['auteur qui m’a bloqué', 'author-me'],
  ] as const)('%s → absent', async (_case, pair) => {
    const ids = await givenFriendLikingPublicReel();
    const [blocker, blocked] = pair.split('-') as [
      'me' | 'friend' | 'author',
      'me' | 'friend' | 'author',
    ];
    await db.insert(blocks).values({ blockerId: ids[blocker], blockedId: ids[blocked] });

    expect(await friendsTab(ids.me)).toEqual([]);
  });

  it.each(['suspended', 'banned', 'deleted'] as const)(
    'ami ou auteur %s → absent',
    async (status) => {
      const first = await givenFriendLikingPublicReel();
      await db.update(profiles).set({ status }).where(eq(profiles.id, first.friend));
      const second = await givenFriendLikingPublicReel();
      await db.update(profiles).set({ status }).where(eq(profiles.id, second.author));

      expect(await friendsTab(first.me)).toEqual([]);
      expect(await friendsTab(second.me)).toEqual([]);
    },
  );

  it('mon propre reel aimé par un ami, mes propres interactions, photos et reels supprimés → absents', async () => {
    const me = await newProfile('me');
    const friend = await newProfile('friend');
    await befriend(me, friend);
    const mine = await newPost(me);
    await like(friend, mine);
    const other = await newPost(await newProfile('other'));
    await like(me, other);
    const photo = await newPost(friend, 'post');
    await like(friend, photo);
    const removed = await newPost(friend);
    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, removed));

    expect(await friendsTab(me)).toEqual([]);
  });

  it('même date d’activité : pages de 10 sans saut ni doublon', async () => {
    const me = await newProfile('me');
    const friend = await newProfile('friend');
    await befriend(me, friend);
    const author = await newProfile('author');
    const at = new Date('2027-01-01T00:00:00.000Z');
    const reels: string[] = [];
    for (let i = 0; i < 11; i++) {
      const reel = await newPost(author);
      reels.push(reel);
      await like(friend, reel, at);
    }
    const expected = [...reels].sort().reverse();

    const first = await feed.listFriendsReels({ viewerId: me, after: null, limit: 10 });
    const second = await feed.listFriendsReels({ viewerId: me, after: first.next, limit: 10 });

    expect(first.items.map(({ post }) => post.id)).toEqual(expected.slice(0, 10));
    expect(first.next).toEqual({ createdAt: at, id: expected[9] });
    expect(second.items.map(({ post }) => post.id)).toEqual(expected.slice(10));
    expect(second.next).toBeNull();
  });

  it('findReel : reel seulement, non supprimé', async () => {
    const me = await newProfile('me');
    const reel = await newPost(me);
    const photo = await newPost(me, 'post');

    expect((await feed.findReel(reel, me))?.id).toBe(reel);
    expect(await feed.findReel(photo, me)).toBeNull();
  });
});

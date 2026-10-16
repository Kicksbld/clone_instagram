import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { purgeAccountData } from '../src/account.ts';
import { newId } from '../src/ids.ts';
import { comments, postLikes } from '../src/schema/engagement.ts';
import { media } from '../src/schema/media.ts';
import { reports } from '../src/schema/moderation.ts';
import { posts } from '../src/schema/posts.ts';
import { profiles } from '../src/schema/profiles.ts';
import { blocks, follows } from '../src/schema/social.ts';
import { subscriptions } from '../src/schema/billing.ts';
import { connectTestDatabase } from './support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const createdProfiles: string[] = [];

afterEach(async () => {
  if (createdProfiles.length > 0)
    await db.delete(profiles).where(inArray(profiles.id, createdProfiles));
  createdProfiles.length = 0;
});

afterAll(() => database.close());

async function givenProfile(status: 'active' | 'deleted' = 'active'): Promise<string> {
  const id = newId();
  await db.insert(profiles).values({
    id,
    username: `t${id.replaceAll('-', '').slice(-20)}`,
    fullName: 'Test',
    birthDate: '2000-01-01',
    status,
  });
  createdProfiles.push(id);
  return id;
}

async function givenPost(authorId: string): Promise<string> {
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post' });
  return id;
}

async function givenComment(
  postId: string,
  authorId: string,
  values: { parentId?: string; deletedAt?: Date } = {},
): Promise<string> {
  const id = newId();
  await db.insert(comments).values({ id, postId, authorId, body: 'Bravo', ...values });
  return id;
}

/** Compteurs tenus comme le font les use cases (T5, T8, T9). */
async function setCounters(): Promise<void> {
  await db.execute(`
    UPDATE profiles p SET
      follower_count = (SELECT count(*) FROM follows WHERE followee_id = p.id),
      following_count = (SELECT count(*) FROM follows WHERE follower_id = p.id)
    WHERE p.id IN (${createdProfiles.map((id) => `'${id}'`).join(', ')});
    UPDATE posts p SET
      like_count = (SELECT count(*) FROM post_likes WHERE post_id = p.id),
      comment_count = (SELECT count(*) FROM comments WHERE post_id = p.id AND deleted_at IS NULL)
    WHERE p.author_id IN (${createdProfiles.map((id) => `'${id}'`).join(', ')});
    UPDATE comments c SET
      reply_count = (SELECT count(*) FROM comments r WHERE r.parent_id = c.id AND r.deleted_at IS NULL)
    WHERE c.author_id IN (${createdProfiles.map((id) => `'${id}'`).join(', ')});
  `);
}

describe('purgeAccountData', () => {
  it('efface le compte et ses données, et corrige les compteurs des autres comptes', async () => {
    const gone = await givenProfile('deleted');
    const alice = await givenProfile();
    const bruno = await givenProfile();

    // Abonnements dans les deux sens, blocage.
    await db.insert(follows).values([
      { followerId: gone, followeeId: alice },
      { followerId: bruno, followeeId: gone },
      { followerId: bruno, followeeId: alice },
    ]);
    await db.insert(blocks).values({ blockerId: alice, blockedId: gone });

    // Post d'Alice : liké et commenté par le compte supprimé.
    const alicePost = await givenPost(alice);
    await db.insert(postLikes).values([
      { userId: gone, postId: alicePost },
      { userId: bruno, postId: alicePost },
    ]);
    const goneComment = await givenComment(alicePost, gone);
    await givenComment(alicePost, bruno, { parentId: goneComment }); // effacée par la cascade
    await givenComment(alicePost, gone, { deletedAt: new Date() }); // déjà hors des compteurs
    const brunoComment = await givenComment(alicePost, bruno);
    await givenComment(alicePost, gone, { parentId: brunoComment });
    await givenComment(alicePost, alice, { parentId: brunoComment });

    // Contenus du compte supprimé.
    const gonePost = await givenPost(gone);
    await db.insert(postLikes).values({ userId: alice, postId: gonePost });
    await db.insert(media).values({
      id: newId(),
      ownerId: gone,
      kind: 'image',
      purpose: 'avatar',
      originalPath: `${gone}/avatar`,
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });
    await db.insert(subscriptions).values({
      userId: gone,
      entitlement: 'plus',
      status: 'active',
      productId: 'plus.monthly',
      expiresAt: new Date(),
      refreshedAt: new Date(),
    });
    await db.insert(reports).values([
      { id: newId(), reporterId: gone, userId: alice, reason: 'spam' },
      { id: newId(), reporterId: alice, userId: gone, reason: 'spam' },
    ]);
    await setCounters();

    expect(await db.transaction((tx) => purgeAccountData(tx, gone))).toBe(true);

    expect(await db.select().from(profiles).where(eq(profiles.id, gone))).toHaveLength(0);
    expect(await db.select().from(media).where(eq(media.ownerId, gone))).toHaveLength(0);
    expect(await db.select().from(posts).where(eq(posts.id, gonePost))).toHaveLength(0);
    expect(
      await db.select().from(subscriptions).where(eq(subscriptions.userId, gone)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(reports)
        .where(inArray(reports.reporterId, [alice])),
    ).toHaveLength(0);
    expect(await db.select().from(blocks).where(eq(blocks.blockerId, alice))).toHaveLength(0);

    const counts = await db
      .select({
        id: profiles.id,
        followers: profiles.followerCount,
        following: profiles.followingCount,
      })
      .from(profiles)
      .where(inArray(profiles.id, [alice, bruno]));
    expect(counts).toEqual(
      expect.arrayContaining([
        { id: alice, followers: 1, following: 0 },
        { id: bruno, followers: 0, following: 1 },
      ]),
    );
    const [post] = await db.select().from(posts).where(eq(posts.id, alicePost));
    // Reste : le commentaire de Bruno et la réponse d'Alice.
    expect(post).toMatchObject({ likeCount: 1, commentCount: 2 });
    const [parent] = await db.select().from(comments).where(eq(comments.id, brunoComment));
    expect(parent?.replyCount).toBe(1);
  });

  it('ne touche pas un compte actif', async () => {
    const id = await givenProfile('active');

    expect(await db.transaction((tx) => purgeAccountData(tx, id))).toBe(false);
    expect(await db.select().from(profiles).where(eq(profiles.id, id))).toHaveLength(1);
  });

  it('rejouée sur un compte déjà purgé : sans erreur ni effet', async () => {
    const id = await givenProfile('deleted');

    expect(await db.transaction((tx) => purgeAccountData(tx, id))).toBe(true);
    expect(await db.transaction((tx) => purgeAccountData(tx, id))).toBe(false);
  });
});

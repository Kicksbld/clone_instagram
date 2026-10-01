import { randomBytes } from 'node:crypto';

import {
  follows,
  media,
  newId,
  postLikes,
  postMedia,
  posts,
  profiles,
  type Executor,
} from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { LikePost } from '../../../src/modules/engagement/application/use-cases/like-post.ts';
import { UnlikePost } from '../../../src/modules/engagement/application/use-cases/unlike-post.ts';
import {
  DrizzleLikeablePostReader,
  DrizzleLikeRepository,
} from '../../../src/modules/engagement/infrastructure/persistence/drizzle-likes.ts';
import { DrizzleFeedReader } from '../../../src/modules/feed/infrastructure/persistence/drizzle-feed-reader.ts';
import { PostNotFoundError } from '../../../src/modules/posts/domain/errors.ts';
import { DrizzlePostReader } from '../../../src/modules/posts/infrastructure/persistence/drizzle-post-repository.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const likes = new DrizzleLikeRepository(db);
const reader = new DrizzlePostReader(db);
const feed = new DrizzleFeedReader(db);
const transaction = new DrizzleUnitOfWork(db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  posts: new DrizzleLikeablePostReader(tx),
  likes: new DrizzleLikeRepository(tx),
}));
const like = new LikePost(transaction);
const unlike = new UnlikePost(transaction);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, médias, abonnements et likes (ON DELETE CASCADE).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function newProfile(suffix: string): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
  });
  return id;
}

/** Post d'une image prête. */
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

async function likeCountOf(postId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ likeCount: posts.likeCount })
    .from(posts)
    .where(eq(posts.id, postId));
  return row?.likeCount;
}

describe('DrizzleLikeRepository', () => {
  it('add et remove : idempotents', async () => {
    const author = await newProfile('author');
    const postId = await newPost(author);

    await expect(likes.add(author, postId)).resolves.toBe(true);
    await expect(likes.add(author, postId)).resolves.toBe(false);
    await expect(likes.remove(author, postId)).resolves.toBe(true);
    await expect(likes.remove(author, postId)).resolves.toBe(false);
  });
});

describe('LikePost / UnlikePost sur Postgres', () => {
  it('like puis unlike : ligne et compteur dans la même transaction', async () => {
    const [me, author] = [await newProfile('me'), await newProfile('author')];
    const postId = await newPost(author);

    await expect(like.execute({ viewerId: me, postId })).resolves.toEqual({
      liked: true,
      likeCount: 1,
    });
    await expect(like.execute({ viewerId: me, postId })).resolves.toEqual({
      liked: true,
      likeCount: 1,
    });
    expect(await likeCountOf(postId)).toBe(1);

    await expect(unlike.execute({ viewerId: me, postId })).resolves.toEqual({
      liked: false,
      likeCount: 0,
    });
    await expect(unlike.execute({ viewerId: me, postId })).resolves.toEqual({
      liked: false,
      likeCount: 0,
    });
    expect(await likeCountOf(postId)).toBe(0);
    await expect(db.select().from(postLikes).where(eq(postLikes.postId, postId))).resolves.toEqual(
      [],
    );
  });

  it('likes simultanés de comptes différents : aucune mise à jour perdue', async () => {
    const author = await newProfile('author');
    const fans = await Promise.all(Array.from({ length: 5 }, (_, i) => newProfile(`fan${i}`)));
    const postId = await newPost(author);

    await Promise.all(fans.map((fan) => like.execute({ viewerId: fan, postId })));

    expect(await likeCountOf(postId)).toBe(5);
  });

  it('post supprimé → post_not_found, aucun like', async () => {
    const [me, author] = [await newProfile('me'), await newProfile('author')];
    const postId = await newPost(author);
    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));

    await expect(like.execute({ viewerId: me, postId })).rejects.toBeInstanceOf(PostNotFoundError);
    expect(await likeCountOf(postId)).toBe(0);
  });
});

describe('likeCount et viewerHasLiked à la lecture', () => {
  it('propres à chaque appelant, dans le détail, la grille et le feed', async () => {
    const [me, other, author] = [
      await newProfile('me'),
      await newProfile('other'),
      await newProfile('author'),
    ];
    const postId = await newPost(author);
    await db.insert(follows).values([
      { followerId: me, followeeId: author },
      { followerId: other, followeeId: author },
    ]);
    await like.execute({ viewerId: me, postId });

    await expect(reader.findById(postId, me)).resolves.toMatchObject({
      likeCount: 1,
      viewerHasLiked: true,
    });
    await expect(reader.findById(postId, other)).resolves.toMatchObject({
      likeCount: 1,
      viewerHasLiked: false,
    });
    const grid = await reader.listByAuthor({
      viewerId: other,
      authorId: author,
      after: null,
      limit: 12,
    });
    expect(grid.items).toMatchObject([{ id: postId, viewerHasLiked: false }]);
    const page = await feed.listFeed({ viewerId: me, after: null, limit: 12 });
    expect(page.items).toMatchObject([{ id: postId, likeCount: 1, viewerHasLiked: true }]);
  });
});

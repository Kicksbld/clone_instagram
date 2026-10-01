import { randomBytes } from 'node:crypto';

import {
  blocks,
  follows,
  media,
  newId,
  postMedia,
  posts,
  profiles,
  type NewProfileRow,
} from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleFeedReader } from '../../../src/modules/feed/infrastructure/persistence/drizzle-feed-reader.ts';
import type { PageCursor } from '../../../src/shared/domain/pagination.ts';
import { canViewContent } from '../../../src/shared/domain/visibility.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const feed = new DrizzleFeedReader(db);
const accounts = new DrizzleAccountReader(db);
const relationships = new DrizzleRelationshipReader(db);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;
let clock = Date.parse('2026-09-25T12:00:00.000Z');

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, médias, abonnements et blocages (ON DELETE CASCADE).
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

/** Post d'une image prête ; `createdAt` 1 ms après le précédent, sauf date imposée. */
async function newPost(authorId: string, createdAt = new Date(++clock)): Promise<string> {
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
    attachedAt: createdAt,
  });
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post', caption: '', createdAt });
  await db.insert(postMedia).values({ postId: id, mediaId, position: 0 });
  return id;
}

const follow = (followerId: string, followeeId: string) =>
  db.insert(follows).values({ followerId, followeeId });

async function feedOf(viewerId: string, limit = 50): Promise<string[]> {
  const page = await feed.listFeed({ viewerId, after: null, limit });
  return page.items.map((post) => post.id);
}

describe('DrizzleFeedReader', () => {
  it('mes posts et ceux des comptes suivis, du plus récent au plus ancien, avec leurs médias', async () => {
    const [me, followed, stranger] = [
      await newProfile('me'),
      await newProfile('followed'),
      await newProfile('stranger'),
    ];
    await follow(me, followed);
    const mine = await newPost(me);
    const theirs = await newPost(followed);
    await newPost(stranger);

    const page = await feed.listFeed({ viewerId: me, after: null, limit: 12 });

    expect(page.items.map((post) => post.id)).toEqual([theirs, mine]);
    expect(page.items[0]).toMatchObject({
      author: { id: followed, status: 'active' },
      media: [{ width: 1080, height: 1350 }],
    });
    expect(page.next).toBeNull();
  });

  it('post supprimé absent', async () => {
    const me = await newProfile('me');
    const post = await newPost(me);
    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post));

    expect(await feedOf(me)).toEqual([]);
  });

  it('même date : départage par id décroissant', async () => {
    const me = await newProfile('me');
    const at = new Date(++clock);
    const ids = [await newPost(me, at), await newPost(me, at), await newPost(me, at)];

    expect(await feedOf(me)).toEqual([...ids].sort().reverse());
  });

  it('pagination par curseur sans trou ni doublon', async () => {
    const [me, followed] = [await newProfile('me'), await newProfile('followed')];
    await follow(me, followed);
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await newPost(i % 2 === 0 ? me : followed));

    const seen: string[] = [];
    let after: PageCursor | null = null;
    do {
      const page = await feed.listFeed({ viewerId: me, after, limit: 3 });
      seen.push(...page.items.map((post) => post.id));
      after = page.next;
    } while (after);

    expect(seen).toEqual([...ids].reverse());
  });

  it('filtre SQL identique à la politique de visibilité (ADR-006)', async () => {
    const viewer = await newProfile('viewer');
    const cases = {
      public: await newProfile('public'),
      private: await newProfile('private', { isPrivate: true }),
      suspended: await newProfile('suspended', { status: 'suspended' }),
      banned: await newProfile('banned', { status: 'banned' }),
      blockedByViewer: await newProfile('blockedbyviewer'),
      blocksViewer: await newProfile('blocksviewer'),
    };
    const notFollowed = await newProfile('notfollowed');
    for (const id of Object.values(cases)) await follow(viewer, id);
    await db.insert(blocks).values([
      { blockerId: viewer, blockedId: cases.blockedByViewer },
      { blockerId: cases.blocksViewer, blockedId: viewer },
    ]);
    const postByAuthor = new Map<string, string>();
    for (const id of [viewer, notFollowed, ...Object.values(cases)]) {
      postByAuthor.set(id, await newPost(id));
    }

    const expected: string[] = [];
    for (const [authorId, postId] of postByAuthor) {
      const author = await accounts.findById(authorId);
      const relation = await relationships.between(viewer, authorId);
      const inFeed = authorId === viewer || relation.viewerFollowsOwner;
      if (author && inFeed && canViewContent(viewer, author, relation)) expected.push(postId);
    }

    expect((await feedOf(viewer)).sort()).toEqual(expected.sort());
    expect(expected.sort()).toEqual(
      [viewer, cases.public, cases.private].map((id) => postByAuthor.get(id)).sort(),
    );
  });
});

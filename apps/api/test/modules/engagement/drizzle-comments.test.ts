import { randomBytes } from 'node:crypto';

import { blocks, comments, newId, posts, profiles, type Executor } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CreateComment } from '../../../src/modules/engagement/application/use-cases/create-comment.ts';
import { DeleteComment } from '../../../src/modules/engagement/application/use-cases/delete-comment.ts';
import { ListComments } from '../../../src/modules/engagement/application/use-cases/list-comments.ts';
import { ListReplies } from '../../../src/modules/engagement/application/use-cases/list-replies.ts';
import { ReplyToReplyError } from '../../../src/modules/engagement/domain/errors.ts';
import {
  DrizzleCommentReader,
  DrizzleCommentRepository,
} from '../../../src/modules/engagement/infrastructure/persistence/drizzle-comments.ts';
import { DrizzleLikeablePostReader } from '../../../src/modules/engagement/infrastructure/persistence/drizzle-likes.ts';
import { DrizzlePostReader } from '../../../src/modules/posts/infrastructure/persistence/drizzle-post-repository.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { systemClock } from '../../../src/shared/infrastructure/system-clock.ts';
import { uuidV7Generator } from '../../../src/shared/infrastructure/uuid-v7-generator.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const relationships = new DrizzleRelationshipReader(db);
const reader = new DrizzleCommentReader(db);
const transaction = new DrizzleUnitOfWork(db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  posts: new DrizzleLikeablePostReader(tx),
  comments: new DrizzleCommentRepository(tx),
  reader: new DrizzleCommentReader(tx),
}));
const create = new CreateComment(transaction, uuidV7Generator, systemClock);
const remove = new DeleteComment(transaction);
const listComments = new ListComments(relationships, new DrizzleLikeablePostReader(db), reader);
const listReplies = new ListReplies(relationships, new DrizzleCommentRepository(db), reader);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts et commentaires (ON DELETE CASCADE).
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

/** Post sans média : les commentaires ne lisent que le post et son auteur. */
async function newPost(authorId: string): Promise<string> {
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post', caption: '' });
  return id;
}

async function countsOf(postId: string) {
  const [post] = await db
    .select({ commentCount: posts.commentCount })
    .from(posts)
    .where(eq(posts.id, postId));
  return post?.commentCount;
}

const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

describe('commentaires sur Postgres', () => {
  it('commentaire, réponse, suppression : lignes et compteurs dans la même transaction', async () => {
    const [me, author] = [await newProfile('me'), await newProfile('author')];
    const postId = await newPost(author);

    const parent = await create.execute({ authorId: me, postId, body: '  Bravo ' });
    expect(parent).toMatchObject({ body: 'Bravo', parentId: null, viewerCanDelete: true });
    const reply = await create.execute({
      authorId: author,
      postId,
      body: 'Merci',
      parentId: parent.id,
    });
    await expect(
      create.execute({ authorId: me, postId, body: 'Encore', parentId: reply.id }),
    ).rejects.toBeInstanceOf(ReplyToReplyError);
    expect(await countsOf(postId)).toBe(2);

    const page = await listComments.execute({ viewerId: me, postId, after: null });
    expect(page.items).toMatchObject([{ id: parent.id, replyCount: 1 }]);
    expect(
      ids(await listReplies.execute({ viewerId: me, commentId: parent.id, after: null })),
    ).toEqual([reply.id]);

    // Le lecteur de posts partagé (détail, grille, feed) lit le même compteur.
    await expect(new DrizzlePostReader(db).findById(postId, me)).resolves.toMatchObject({
      commentCount: 2,
    });

    await remove.execute({ viewerId: me, commentId: parent.id });
    expect(await countsOf(postId)).toBe(0);
    const rows = await db.select().from(comments).where(eq(comments.postId, postId));
    expect(rows.every((row) => row.deletedAt !== null)).toBe(true);
  });

  it('supprimer une réponse décrémente reply_count du parent', async () => {
    const [me, author] = [await newProfile('me'), await newProfile('author')];
    const postId = await newPost(author);
    const parent = await create.execute({ authorId: author, postId, body: 'Parent' });
    const reply = await create.execute({
      authorId: me,
      postId,
      body: 'Réponse',
      parentId: parent.id,
    });

    await remove.execute({ viewerId: me, commentId: reply.id });

    const [row] = await db.select().from(comments).where(eq(comments.id, parent.id));
    expect(row?.replyCount).toBe(0);
    expect(await countsOf(postId)).toBe(1);
  });

  it('la liste traduit la visibilité en SQL : bloqués dans les deux sens et suspendus absents', async () => {
    const [me, author, blocked, blocker, suspended] = [
      await newProfile('me'),
      await newProfile('author'),
      await newProfile('blocked'),
      await newProfile('blocker'),
      await newProfile('suspended'),
    ];
    const postId = await newPost(author);
    for (const authorId of [blocked, blocker, suspended]) {
      await create.execute({ authorId, postId, body: 'Masqué' });
    }
    const mine = await create.execute({ authorId: me, postId, body: 'Visible' });
    await db.insert(blocks).values([
      { blockerId: me, blockedId: blocked },
      { blockerId: blocker, blockedId: me },
    ]);
    await db.update(profiles).set({ status: 'suspended' }).where(eq(profiles.id, suspended));

    expect(ids(await listComments.execute({ viewerId: me, postId, after: null }))).toEqual([
      mine.id,
    ]);
    // L'auteur du post, lui, voit les commentaires des comptes que je bloque.
    expect(ids(await listComments.execute({ viewerId: author, postId, after: null }))).toHaveLength(
      3,
    );
  });

  it('pagination par curseur (created_at, id), du plus récent au plus ancien', async () => {
    const author = await newProfile('author');
    const postId = await newPost(author);
    const all: string[] = [];
    for (let i = 0; i < 25; i++) {
      all.unshift((await create.execute({ authorId: author, postId, body: `n°${i}` })).id);
    }

    const first = await listComments.execute({ viewerId: author, postId, after: null });
    const second = await listComments.execute({ viewerId: author, postId, after: first.next });

    expect([...ids(first), ...ids(second)]).toEqual(all);
    expect(first.items).toHaveLength(20);
    expect(second.next).toBeNull();
  });
});

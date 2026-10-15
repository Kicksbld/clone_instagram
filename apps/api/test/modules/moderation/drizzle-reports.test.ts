import { randomBytes } from 'node:crypto';

import { comments, newId, posts, profiles, reports } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  DrizzleReportRepository,
  DrizzleReportTargetReader,
} from '../../../src/modules/moderation/infrastructure/persistence/drizzle-reports.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const repository = new DrizzleReportRepository(db);
const targets = new DrizzleReportTargetReader(db);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, commentaires et signalements (cascade).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function newProfile(suffix: string, isPrivate = false): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
    isPrivate,
  });
  return id;
}

async function newPost(authorId: string): Promise<string> {
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post', caption: '' });
  return id;
}

describe('DrizzleReportTargetReader', () => {
  it('lit l’auteur d’un post, d’un commentaire et de son post, et un compte ; null si absent ou supprimé', async () => {
    const [author, commenter] = [await newProfile('author', true), await newProfile('commenter')];
    const postId = await newPost(author);
    const commentId = newId();
    await db.insert(comments).values({ id: commentId, postId, authorId: commenter, body: 'Ok' });

    await expect(targets.findPostAuthor(postId)).resolves.toEqual({
      id: author,
      status: 'active',
      isPrivate: true,
    });
    await expect(targets.findComment(commentId)).resolves.toEqual({
      author: { id: commenter, status: 'active', isPrivate: false },
      postAuthor: { id: author, status: 'active', isPrivate: true },
    });
    await expect(targets.findUser(commenter)).resolves.toMatchObject({ id: commenter });

    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
    await expect(targets.findPostAuthor(postId)).resolves.toBeNull();
    await expect(targets.findComment(commentId)).resolves.toBeNull();
    await expect(targets.findUser(newId())).resolves.toBeNull();
  });
});

describe('DrizzleReportRepository', () => {
  it('enregistre un signalement `open` sur la colonne de sa cible', async () => {
    const [reporter, author] = [await newProfile('reporter'), await newProfile('author')];
    const postId = await newPost(author);
    const id = newId();

    await repository.create({
      id,
      reporterId: reporter,
      target: { type: 'post', id: postId },
      reason: 'spam',
      details: 'Publicité',
    });
    await repository.create({
      id: newId(),
      reporterId: reporter,
      target: { type: 'user', id: author },
      reason: 'other',
      details: null,
    });

    const rows = await db.select().from(reports).where(eq(reports.reporterId, reporter));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === id)).toMatchObject({
      postId,
      commentId: null,
      userId: null,
      reason: 'spam',
      details: 'Publicité',
      status: 'open',
      resolvedAt: null,
    });
  });

  it('CHECK : exactement une cible', async () => {
    const [reporter, author] = [await newProfile('reporter'), await newProfile('author')];
    const postId = await newPost(author);

    await expect(
      db.insert(reports).values({ id: newId(), reporterId: reporter, reason: 'spam' }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(reports)
        .values({ id: newId(), reporterId: reporter, reason: 'spam', postId, userId: author }),
    ).rejects.toThrow();
  });
});

import { randomBytes } from 'node:crypto';

import {
  adminAuditLog,
  comments,
  media,
  newId,
  postMedia,
  posts,
  profiles,
  reports,
} from '@clone/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  DrizzleAdminReportReader,
  DrizzleReportResolutionRepository,
} from '../../../src/modules/moderation/infrastructure/persistence/drizzle-admin-reports.ts';
import { DrizzlePostRepository } from '../../../src/modules/posts/infrastructure/persistence/drizzle-post-repository.ts';
import { DrizzleAdminAuditLog } from '../../../src/shared/infrastructure/persistence/drizzle-admin-audit-log.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const reader = new DrizzleAdminReportReader(db);
const resolutions = new DrizzleReportResolutionRepository(db);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, commentaires, médias et signalements (cascade).
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

async function newPost(authorId: string, caption = ''): Promise<string> {
  const id = newId();
  await db.insert(posts).values({ id, authorId, kind: 'post', caption });
  return id;
}

async function newReport(
  reporterId: string,
  target: { postId?: string; commentId?: string; userId?: string },
  values: Partial<typeof reports.$inferInsert> = {},
): Promise<string> {
  const id = newId();
  await db.insert(reports).values({ id, reporterId, reason: 'spam', ...target, ...values });
  return id;
}

describe('DrizzleAdminReportReader', () => {
  it('liste par statut, motif et type, du plus récent au plus ancien, avec extrait et curseur', async () => {
    const [reporter, author] = [await newProfile('reporter'), await newProfile('author')];
    const postId = await newPost(author, 'Promo à ne pas manquer');
    const commentId = newId();
    await db.insert(comments).values({ id: commentId, postId, authorId: author, body: 'Spam' });
    const onPost = await newReport(reporter, { postId });
    const onComment = await newReport(reporter, { commentId }, { reason: 'hate' });
    const onUser = await newReport(reporter, { userId: author });
    await newReport(reporter, { userId: author }, { status: 'resolved_dismissed' });

    // Filtré sur ce test : la base de dev contient d'autres signalements.
    const mine = async (query: Partial<Parameters<typeof reader.list>[0]> = {}) => {
      const page = await reader.list({
        status: 'open',
        reason: null,
        targetType: null,
        after: null,
        limit: 1000,
        ...query,
      });
      return page.items.filter((item) => item.reporter.id === reporter);
    };

    expect((await mine()).map((item) => [item.id, item.excerpt])).toEqual([
      [onUser, `${RUN}_author`],
      [onComment, 'Spam'],
      [onPost, 'Promo à ne pas manquer'],
    ]);
    expect((await mine({ reason: 'hate' })).map((item) => item.id)).toEqual([onComment]);
    expect((await mine({ targetType: 'post' })).map((item) => item.id)).toEqual([onPost]);
    expect(await mine({ status: 'resolved_dismissed' })).toHaveLength(1);

    const first = await reader.list({
      status: 'open',
      reason: null,
      targetType: null,
      after: null,
      limit: 1,
    });
    expect(first.items).toHaveLength(1);
    expect(first.next).not.toBeNull();
    const second = await reader.list({
      status: 'open',
      reason: null,
      targetType: null,
      after: first.next,
      limit: 1,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('détail : signalement, autres ouverts, post (même supprimé) et commentaire', async () => {
    const [reporter, author] = [await newProfile('reporter'), await newProfile('author')];
    const postId = await newPost(author, 'Légende');
    const mediaId = newId();
    await db.insert(media).values({
      id: mediaId,
      ownerId: author,
      kind: 'image',
      purpose: 'post',
      status: 'ready',
      originalPath: `${author}/${mediaId}`,
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
      width: 1080,
      height: 1350,
      variants: { thumb: 't.webp', medium: 'm.webp', large: 'l.webp' },
      attachedAt: sql`now()`,
    });
    await db.insert(postMedia).values({ postId, mediaId, position: 0 });
    const commentId = newId();
    await db.insert(comments).values({ id: commentId, postId, authorId: reporter, body: 'Ok' });
    const reportId = await newReport(reporter, { postId }, { details: 'Arnaque' });
    await newReport(author, { postId });

    await expect(reader.findById(reportId)).resolves.toMatchObject({
      id: reportId,
      target: { type: 'post', id: postId },
      details: 'Arnaque',
      status: 'open',
      reporter: { id: reporter, username: `${RUN}_reporter` },
      resolvedAt: null,
    });
    await expect(reader.countOpen({ type: 'post', id: postId }, reportId)).resolves.toBe(1);

    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
    await expect(reader.findPost(postId)).resolves.toMatchObject({
      caption: 'Légende',
      removed: true,
      author: { id: author, avatarVariants: null },
      media: [{ width: 1080, height: 1350, variants: { thumb: 't.webp' } }],
    });
    await expect(reader.findComment(commentId)).resolves.toMatchObject({
      postId,
      body: 'Ok',
      removed: true,
    });
    await expect(reader.findById(newId())).resolves.toBeNull();
  });
});

describe('DrizzleReportResolutionRepository', () => {
  it('verrouille les signalements ouverts d’une cible et les résout ensemble', async () => {
    const [reporter, author] = [await newProfile('reporter'), await newProfile('author')];
    const postId = await newPost(author);
    const first = await newReport(reporter, { postId });
    const second = await newReport(author, { postId });
    await newReport(reporter, { postId }, { status: 'resolved_dismissed' });
    const adminId = newId();

    await db.transaction(async (tx) => {
      const repository = new DrizzleReportResolutionRepository(tx);
      await expect(repository.findTarget(first)).resolves.toEqual({
        target: { type: 'post', id: postId },
        status: 'open',
      });
      const ids = await repository.lockOpen({ type: 'post', id: postId });
      expect(ids).toEqual([first, second].sort());
      await repository.resolve(ids, {
        status: 'resolved_removed',
        resolvedBy: adminId,
        note: 'Ok',
      });
    });

    const rows = await db
      .select()
      .from(reports)
      .where(inArray(reports.id, [first, second]));
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'resolved_removed',
        resolvedBy: adminId,
        resolutionNote: 'Ok',
      });
      expect(row.resolvedAt).not.toBeNull();
    }
    await expect(resolutions.lockOpen({ type: 'post', id: postId })).resolves.toEqual([]);
    await expect(resolutions.findTarget(newId())).resolves.toBeNull();
  });

  it('suppression par modération : tout auteur, une seule fois', async () => {
    const author = await newProfile('author');
    const postId = await newPost(author);
    const repository = new DrizzlePostRepository(db);

    await expect(repository.softDeleteByModeration(postId)).resolves.toEqual({
      authorId: author,
      mediaIds: [],
    });
    await expect(repository.softDeleteByModeration(postId)).resolves.toBeNull();
  });

  it('journal d’audit : accepte les actions et cibles de modération', async () => {
    const targetId = newId();
    await new DrizzleAdminAuditLog(db).record({
      adminId: newId(),
      action: 'post_removed',
      target: { type: 'post', id: targetId },
      metadata: { reportIds: [newId()], note: 'Spam' },
    });

    const [row] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, targetId));
    expect(row).toMatchObject({ action: 'post_removed', targetType: 'post' });
  });
});

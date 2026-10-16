import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../support/test-app.ts';
import { signTestToken } from '../../support/tokens.ts';

const ADMIN = '0199a1b2-0000-7000-8000-00000000a001';
const REPORTER = '0199a1b2-0000-7000-8000-000000000001';
const AUTHOR = '0199a1b2-0000-7000-8000-000000000002';
const OTHER = '0199a1b2-0000-7000-8000-000000000003';
const UNKNOWN = '0199a1b2-0000-7000-a000-00000000ffff';

let context: ReturnType<typeof buildTestApp>;
let admin: { authorization: string };

beforeEach(async () => {
  context = buildTestApp();
  context.adminRoles.admins.add(ADMIN);
  admin = { authorization: `Bearer ${await signTestToken(ADMIN)}` };
  context.profiles.add({ id: REPORTER, username: 'killian' });
  context.profiles.add({ id: AUTHOR, username: 'lea' });
  context.profiles.add({ id: OTHER, username: 'ines' });
});

afterEach(async () => {
  await context.app.close();
});

const as = async (userId: string) => ({
  authorization: `Bearer ${await signTestToken(userId)}`,
});

let mediaCounter = 0;
async function givenPost(authorId: string, caption = 'Légende'): Promise<string> {
  const mediaId = `0199a1b2-0000-7000-b000-${String(++mediaCounter).padStart(12, '0')}`;
  context.media.addReady({ id: mediaId, ownerId: authorId, purpose: 'post' });
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/posts',
    headers: await as(authorId),
    payload: { kind: 'post', caption, mediaIds: [mediaId] },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

async function givenComment(postId: string, authorId: string, parentId?: string): Promise<string> {
  const response = await context.app.inject({
    method: 'POST',
    url: `/v1/posts/${postId}/comments`,
    headers: await as(authorId),
    payload: { body: 'Commentaire', ...(parentId && { parentId }) },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

async function givenReport(
  targetType: 'post' | 'comment' | 'user',
  targetId: string,
  reporterId = REPORTER,
  reason = 'spam',
): Promise<string> {
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/reports',
    headers: await as(reporterId),
    payload: { targetType, targetId, reason },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

const resolve = (reportId: string, payload: object, headers = admin) =>
  context.app.inject({
    method: 'POST',
    url: `/v1/admin/reports/${reportId}/resolve`,
    headers,
    payload,
  });

describe('GET /v1/admin/reports', () => {
  const list = async (query = '', headers = admin) =>
    context.app.inject({ method: 'GET', url: `/v1/admin/reports${query}`, headers });

  it('ouverts par défaut, du plus récent au plus ancien, avec un extrait', async () => {
    const postId = await givenPost(AUTHOR, 'Promo !');
    const first = await givenReport('post', postId);
    const second = await givenReport('user', AUTHOR, OTHER, 'hate');
    const dismissed = await givenReport('user', OTHER);
    expect((await resolve(dismissed, { action: 'dismiss' })).statusCode).toBe(200);

    const response = await list();

    expect(response.statusCode).toBe(200);
    const page = response.json<{
      items: { id: string; excerpt?: string }[];
      nextCursor?: string;
    }>();
    expect(page.items.map((item) => [item.id, item.excerpt])).toEqual([
      [second, 'lea'],
      [first, 'Promo !'],
    ]);
    expect(page.nextCursor).toBeUndefined();
    expect(page.items[1]).toMatchObject({
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
      status: 'open',
      reporter: { id: REPORTER, username: 'killian' },
    });
  });

  it('filtres statut, motif et type ; pages de 20 avec curseur', async () => {
    // Directement en mémoire : `POST /v1/reports` est limité à 10 par heure.
    for (let index = 0; index < 22; index += 1) {
      context.reports.rows.push({
        id: `0199a1b2-0000-7000-9d00-${String(index).padStart(12, '0')}`,
        reporterId: REPORTER,
        target: { type: 'user', id: AUTHOR },
        reason: 'spam',
        details: null,
      });
    }
    await givenReport('user', OTHER, REPORTER, 'violence');
    const postId = await givenPost(AUTHOR);
    await givenReport('post', postId);

    const byReason = await list('?reason=violence');
    expect(byReason.json<{ items: unknown[] }>().items).toHaveLength(1);
    const byType = await list('?targetType=post');
    expect(byType.json<{ items: { targetId: string }[] }>().items).toEqual([
      expect.objectContaining({ targetId: postId }),
    ]);
    expect((await list('?status=resolved_removed')).json<{ items: unknown[] }>().items).toEqual([]);

    const first = (await list()).json<{ items: unknown[]; nextCursor?: string }>();
    expect(first.items).toHaveLength(20);
    const second = await list(`?cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
    expect(second.json<{ items: unknown[]; nextCursor?: string }>().items).toHaveLength(4);
  });

  it('curseur invalide → 400 invalid_cursor ; filtre inconnu → 400', async () => {
    expect((await list('?cursor=nimporte')).json()).toMatchObject({ code: 'invalid_cursor' });
    expect((await list('?status=closed')).statusCode).toBe(400);
  });

  it('non-admin → 403 admin_required', async () => {
    const response = await list('', await as(REPORTER));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'admin_required' });
  });
});

describe('GET /v1/admin/reports/{id}', () => {
  const get = async (id: string, headers = admin) =>
    context.app.inject({ method: 'GET', url: `/v1/admin/reports/${id}`, headers });

  it('post signalé : aperçu (auteur, légende, images) et autres signalements ouverts', async () => {
    const postId = await givenPost(AUTHOR, 'Légende');
    const reportId = await givenReport('post', postId);
    await givenReport('post', postId, OTHER);

    const response = await get(reportId);

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      id: reportId,
      status: 'open',
      otherOpenCount: 1,
      post: {
        id: postId,
        author: { id: AUTHOR, username: 'lea' },
        caption: 'Légende',
        removed: false,
      },
    });
    expect(body).not.toHaveProperty('comment');
    expect(body).not.toHaveProperty('user');
  });

  it('commentaire et compte signalés', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId, OTHER);
    const onComment = await givenReport('comment', commentId);
    const onUser = await givenReport('user', OTHER);

    expect((await get(onComment)).json()).toMatchObject({
      comment: { id: commentId, postId, body: 'Commentaire', removed: false },
    });
    expect((await get(onUser)).json()).toMatchObject({
      user: { id: OTHER, username: 'ines', status: 'active' },
    });
  });

  it('inexistant → 404 report_not_found ; non-admin → 403', async () => {
    const missing = await get(UNKNOWN);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'report_not_found' });

    const reportId = await givenReport('user', OTHER);
    expect((await get(reportId, await as(REPORTER))).statusCode).toBe(403);
  });
});

describe('POST /v1/admin/reports/{id}/resolve', () => {
  it('remove_content sur un post : supprimé, compteur, médias détachés, tous ses signalements traités, audit, purge', async () => {
    const postId = await givenPost(AUTHOR);
    const reportId = await givenReport('post', postId);
    const other = await givenReport('post', postId, OTHER);
    const unrelated = await givenReport('user', OTHER);

    const response = await resolve(reportId, { action: 'remove_content', note: '  Spam  ' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: reportId,
      status: 'resolved_removed',
      resolutionNote: 'Spam',
      otherOpenCount: 0,
      post: { id: postId, removed: true },
    });
    expect(response.json()).toHaveProperty('resolvedAt');
    expect(context.posts.rows.get(postId)?.deletedAt).not.toBeNull();
    expect(context.profiles.rows.get(AUTHOR)?.postCount).toBe(0);
    const mediaIds = context.posts.rows.get(postId)?.mediaIds ?? [];
    for (const id of mediaIds) expect(context.media.rows.get(id)?.detachedAt).not.toBeNull();
    expect(context.adminReports.resolutions.get(other)?.status).toBe('resolved_removed');
    expect(context.adminReports.resolutions.has(unrelated)).toBe(false);
    expect(context.adminReports.resolutions.get(reportId)?.resolvedBy).toBe(ADMIN);
    expect(context.auditLog.entries).toEqual([
      {
        adminId: ADMIN,
        action: 'post_removed',
        target: { type: 'post', id: postId },
        metadata: { reportIds: [reportId, other].sort(), note: 'Spam' },
      },
    ]);
    expect([...context.jobs.contentFilesPurges]).toEqual([postId]);

    const feed = await context.app.inject({
      method: 'GET',
      url: `/v1/posts/${postId}`,
      headers: await as(REPORTER),
    });
    expect(feed.statusCode).toBe(404);
  });

  it('remove_content sur un commentaire avec réponses : compteurs exacts', async () => {
    const postId = await givenPost(AUTHOR);
    const commentId = await givenComment(postId, OTHER);
    await givenComment(postId, AUTHOR, commentId);
    await givenComment(postId, REPORTER, commentId);
    await givenComment(postId, REPORTER);
    const reportId = await givenReport('comment', commentId);

    const response = await resolve(reportId, { action: 'remove_content' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ comment: { id: commentId, removed: true } });
    expect(context.posts.rows.get(postId)?.commentCount).toBe(1);
    expect(context.auditLog.entries[0]).toMatchObject({
      action: 'comment_removed',
      target: { type: 'comment', id: commentId },
      metadata: { reportIds: [reportId] },
    });
    expect(context.jobs.contentFilesPurges.size).toBe(0);
  });

  it('remove_content sur une réponse : reply_count du parent décrémenté', async () => {
    const postId = await givenPost(AUTHOR);
    const parentId = await givenComment(postId, OTHER);
    const replyId = await givenComment(postId, AUTHOR, parentId);
    const reportId = await givenReport('comment', replyId);

    expect((await resolve(reportId, { action: 'remove_content' })).statusCode).toBe(200);

    expect(context.comments.rows.get(parentId)?.replyCount).toBe(0);
    expect(context.posts.rows.get(postId)?.commentCount).toBe(1);
  });

  it('contenu déjà supprimé par son auteur : succès, compteurs inchangés', async () => {
    const postId = await givenPost(AUTHOR);
    const reportId = await givenReport('post', postId);
    const deleted = await context.app.inject({
      method: 'DELETE',
      url: `/v1/posts/${postId}`,
      headers: await as(AUTHOR),
    });
    expect(deleted.statusCode).toBe(204);

    const response = await resolve(reportId, { action: 'remove_content' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'resolved_removed', post: { removed: true } });
    expect(context.profiles.rows.get(AUTHOR)?.postCount).toBe(0);
  });

  it('dismiss : contenu intact, signalements classés, note absente', async () => {
    const postId = await givenPost(AUTHOR);
    const reportId = await givenReport('post', postId);

    const response = await resolve(reportId, { action: 'dismiss', note: '   ' });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body).toMatchObject({ status: 'resolved_dismissed', post: { removed: false } });
    expect(body).not.toHaveProperty('resolutionNote');
    expect(context.posts.rows.get(postId)?.deletedAt).toBeNull();
    expect(context.auditLog.entries[0]).toEqual({
      adminId: ADMIN,
      action: 'reports_dismissed',
      target: { type: 'post', id: postId },
      metadata: { reportIds: [reportId] },
    });
    expect(context.jobs.contentFilesPurges.size).toBe(0);
  });

  it('compte signalé : dismiss accepté, remove_content → 422 cannot_remove_user', async () => {
    const reportId = await givenReport('user', OTHER);

    const removal = await resolve(reportId, { action: 'remove_content' });
    expect(removal.statusCode).toBe(422);
    expect(removal.json()).toMatchObject({ code: 'cannot_remove_user' });
    expect(context.auditLog.entries).toEqual([]);

    expect((await resolve(reportId, { action: 'dismiss' })).statusCode).toBe(200);
    expect(context.profiles.rows.get(OTHER)?.status).toBe('active');
  });

  it('déjà traité (lui ou avec un autre du même contenu) → 409 report_already_resolved', async () => {
    const postId = await givenPost(AUTHOR);
    const reportId = await givenReport('post', postId);
    const other = await givenReport('post', postId, OTHER);
    expect((await resolve(reportId, { action: 'dismiss' })).statusCode).toBe(200);

    for (const id of [reportId, other]) {
      const response = await resolve(id, { action: 'remove_content' });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'report_already_resolved' });
    }
    expect(context.posts.rows.get(postId)?.deletedAt).toBeNull();
  });

  it('inexistant → 404 ; non-admin → 403 ; entrée invalide → 400', async () => {
    expect((await resolve(UNKNOWN, { action: 'dismiss' })).json()).toMatchObject({
      code: 'report_not_found',
    });
    const reportId = await givenReport('user', OTHER);
    expect((await resolve(reportId, { action: 'dismiss' }, await as(REPORTER))).statusCode).toBe(
      403,
    );
    expect((await resolve(reportId, { action: 'ban' })).statusCode).toBe(400);
    expect((await resolve(reportId, { action: 'dismiss', note: 'x'.repeat(501) })).statusCode).toBe(
      400,
    );
    expect((await resolve(reportId, { action: 'dismiss', extra: true })).statusCode).toBe(400);
  });
});

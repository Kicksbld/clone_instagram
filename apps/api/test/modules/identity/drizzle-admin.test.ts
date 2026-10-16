import { randomBytes } from 'node:crypto';

import { adminAuditLog, adminRoles, comments, newId, posts, profiles, reports } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleAdminUserReader } from '../../../src/modules/identity/infrastructure/persistence/drizzle-admin-user-reader.ts';
import { DrizzleProfileRepository } from '../../../src/modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { DrizzleUserReportsReader } from '../../../src/modules/moderation/infrastructure/persistence/drizzle-user-reports-reader.ts';
import { DrizzleAdminAuditLog } from '../../../src/shared/infrastructure/persistence/drizzle-admin-audit-log.ts';
import { DrizzleAdminRoles } from '../../../src/shared/infrastructure/persistence/drizzle-admin-roles.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const created: string[] = [];
const admins: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

afterEach(async () => {
  // Supprimer les profils supprime leurs posts, commentaires et signalements (cascade).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
  if (admins.length > 0) {
    await db.delete(adminRoles).where(inArray(adminRoles.userId, admins.splice(0)));
  }
});

afterAll(() => database.close());

async function newProfile(
  suffix: string,
  fields: { status?: 'active' | 'suspended' | 'banned' | 'deleted'; createdAt?: Date } = {},
): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: `Nom ${suffix}`,
    birthDate: '2000-01-31',
    ...fields,
  });
  return id;
}

describe('DrizzleAdminRoles', () => {
  it('rôle admin présent ou absent', async () => {
    const admin = newId();
    admins.push(admin);
    await db.insert(adminRoles).values({ userId: admin, role: 'admin' });
    const roles = new DrizzleAdminRoles(db);

    await expect(roles.isAdmin(admin)).resolves.toBe(true);
    await expect(roles.isAdmin(newId())).resolves.toBe(false);
  });
});

describe('DrizzleAdminAuditLog', () => {
  it('écrit une entrée, puis refuse toute modification ou suppression (écriture seule)', async () => {
    // Les entrées de test restent en base : la table n'accepte aucune suppression.
    const targetId = newId();
    await new DrizzleAdminAuditLog(db).record({
      adminId: newId(),
      action: 'user_suspended',
      target: { type: 'user', id: targetId },
      metadata: { reason: 'Spam', fromStatus: 'active', toStatus: 'suspended' },
    });

    const [row] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, targetId));
    expect(row).toMatchObject({
      action: 'user_suspended',
      targetType: 'user',
      metadata: { reason: 'Spam', fromStatus: 'active', toStatus: 'suspended' },
    });

    await expect(
      db
        .update(adminAuditLog)
        .set({ action: 'user_banned' })
        .where(eq(adminAuditLog.targetId, targetId)),
    ).rejects.toThrow();
    await expect(
      db.delete(adminAuditLog).where(eq(adminAuditLog.targetId, targetId)),
    ).rejects.toThrow();
  });
});

describe('DrizzleProfileRepository.transitionStatus', () => {
  it('écriture conditionnelle sur le statut actuel', async () => {
    const id = await newProfile('transition');
    const repository = new DrizzleProfileRepository(db);

    await expect(repository.transitionStatus(id, ['active'], 'suspended')).resolves.toBe(true);
    await expect(repository.transitionStatus(id, ['active'], 'suspended')).resolves.toBe(false);
    await expect(repository.transitionStatus(newId(), ['active'], 'banned')).resolves.toBe(false);
    expect((await repository.findById(id))?.status).toBe('suspended');
  });
});

describe('DrizzleAdminUserReader', () => {
  const reader = new DrizzleAdminUserReader(db);

  it('recherche partielle, statut, comptes supprimés exclus, curseur (created_at, id)', async () => {
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    const at = (seconds: number) => new Date(base + seconds * 1000);
    const oldest = await newProfile('a_oldest', { createdAt: at(0) });
    const middle = await newProfile('b_middle', { createdAt: at(1), status: 'banned' });
    const newest = await newProfile('c_newest', { createdAt: at(2) });
    await newProfile('d_deleted', { createdAt: at(3), status: 'deleted' });

    const first = await reader.list({ search: RUN, status: null, after: null, limit: 2 });
    expect(first.items.map((p) => p.id)).toEqual([newest, middle]);
    expect(first.next).not.toBeNull();

    const second = await reader.list({ search: RUN, status: null, after: first.next, limit: 2 });
    expect(second.items.map((p) => p.id)).toEqual([oldest]);
    expect(second.next).toBeNull();

    const banned = await reader.list({ search: RUN, status: 'banned', after: null, limit: 20 });
    expect(banned.items.map((p) => p.id)).toEqual([middle]);

    // Nom complet, insensible à la casse ; `_` échappé dans le motif LIKE.
    const byName = await reader.list({
      search: `nom c_newest`,
      status: null,
      after: null,
      limit: 20,
    });
    expect(byName.items.map((p) => p.id)).toEqual([newest]);
  });
});

describe('DrizzleUserReportsReader', () => {
  it('reçus : compte, ses posts et ses commentaires ; émis : par le compte ; total et plus récents', async () => {
    const [target, reporter] = [await newProfile('target'), await newProfile('reporter')];
    const postId = newId();
    await db.insert(posts).values({ id: postId, authorId: target, kind: 'post', caption: '' });
    const commentId = newId();
    await db.insert(comments).values({ id: commentId, postId, authorId: target, body: 'Ok' });
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    const [userReport, postReport, commentReport, filedReport] = [
      newId(),
      newId(),
      newId(),
      newId(),
    ];
    await db.insert(reports).values([
      {
        id: userReport,
        reporterId: reporter,
        userId: target,
        reason: 'spam',
        createdAt: new Date(base),
      },
      {
        id: postReport,
        reporterId: reporter,
        postId,
        reason: 'nudity',
        details: 'Photo',
        createdAt: new Date(base + 1000),
      },
      {
        id: commentReport,
        reporterId: reporter,
        commentId,
        reason: 'hate',
        createdAt: new Date(base + 2000),
      },
      // Émis par la cible, contre le compte qui la signale.
      {
        id: filedReport,
        reporterId: target,
        userId: reporter,
        reason: 'other',
        createdAt: new Date(base + 3000),
      },
    ]);
    const reader = new DrizzleUserReportsReader(db);

    const received = await reader.received(target, 2);
    expect(received.total).toBe(3);
    expect(received.items).toEqual([
      {
        id: commentReport,
        targetType: 'comment',
        targetId: commentId,
        reason: 'hate',
        details: null,
        status: 'open',
        reporter: { id: reporter, username: `${RUN}_reporter` },
        createdAt: new Date(base + 2000),
      },
      expect.objectContaining({ id: postReport, targetType: 'post', details: 'Photo' }),
    ]);

    const filed = await reader.filed(target, 20);
    expect(filed).toMatchObject({
      total: 1,
      items: [{ id: filedReport, targetType: 'user', targetId: reporter }],
    });
  });
});

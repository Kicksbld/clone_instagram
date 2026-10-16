import {
  findMediaById,
  newId,
  postLikes,
  posts,
  profiles,
  STORAGE_BUCKETS,
  subscriptions,
} from '@clone/db';
import { UnrecoverableError } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { variantPaths } from '../../src/jobs/process-image.ts';
import { purgeAccount } from '../../src/jobs/purge-account.ts';
import type { AnalyticsPersons, SubscriptionCustomers } from '../../src/saas.ts';
import { connectTestDatabase } from '../support/database.ts';
import { jobOf, silentLogger, testRows } from '../support/fixtures.ts';
import { InMemoryStorage } from '../support/in-memory-storage.ts';

const database = connectTestDatabase();
const { db } = database;
const rows = testRows(db);

afterEach(() => rows.cleanUp());
afterAll(() => database.close());

/** SaaS en mémoire : identifiants supprimés ; `unavailable` simule une panne. */
class FakeSaas implements SubscriptionCustomers, AnalyticsPersons {
  readonly deleted: string[] = [];
  unavailable = false;

  delete(id: string): Promise<void> {
    if (this.unavailable) return Promise.reject(new Error('HTTP 503'));
    this.deleted.push(id);
    return Promise.resolve();
  }
}

let storage: InMemoryStorage;
let customers: FakeSaas;
let persons: FakeSaas;

beforeEach(() => {
  storage = new InMemoryStorage();
  customers = new FakeSaas();
  persons = new FakeSaas();
});

const run = (profileId: unknown) =>
  purgeAccount({ db, storage, logger: silentLogger, customers, persons })(
    jobOf('purge-account', { profileId }),
  );

async function deletedAccount() {
  const id = await rows.profile();
  await db.update(profiles).set({ status: 'deleted' }).where(eq(profiles.id, id));
  return id;
}

async function statusOf(id: string) {
  const [row] = await db
    .select({ status: profiles.status })
    .from(profiles)
    .where(eq(profiles.id, id));
  return row?.status;
}

describe('purge-account', () => {
  it('efface fichiers, données, client RevenueCat et personne PostHog', async () => {
    const gone = await deletedAccount();
    const other = await rows.profile();
    const file = Buffer.from('x');

    const avatar = await rows.media(gone, { status: 'ready', attachedAt: sql`now()` });
    const variants = variantPaths(avatar.id);
    await db.execute(
      sql`UPDATE media SET variants = ${JSON.stringify(variants)}::jsonb WHERE id = ${avatar.id}`,
    );
    for (const path of [variants.thumb, variants.medium, variants.large]) {
      storage.put(STORAGE_BUCKETS.public, path, file);
    }
    const pending = await rows.media(gone, { status: 'pending_upload' });
    storage.put(STORAGE_BUCKETS.uploads, pending.originalPath, file);
    const otherMedia = await rows.media(other, { status: 'pending_upload' });
    storage.put(STORAGE_BUCKETS.uploads, otherMedia.originalPath, file);

    const otherPost = newId();
    await db.insert(posts).values({ id: otherPost, authorId: other, kind: 'post', likeCount: 1 });
    await db.insert(postLikes).values({ userId: gone, postId: otherPost });
    await db.insert(subscriptions).values({
      userId: gone,
      entitlement: 'plus',
      status: 'active',
      productId: 'plus.monthly',
      expiresAt: new Date(),
      refreshedAt: new Date(),
    });

    await run(gone);

    expect(await statusOf(gone)).toBeUndefined();
    await expect(findMediaById(db, avatar.id)).resolves.toBeNull();
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, gone))).toEqual([]);
    for (const path of [variants.thumb, variants.medium, variants.large]) {
      expect(storage.has(STORAGE_BUCKETS.public, path)).toBe(false);
    }
    expect(storage.has(STORAGE_BUCKETS.uploads, pending.originalPath)).toBe(false);
    expect(customers.deleted).toEqual([gone]);
    expect(persons.deleted).toEqual([gone]);

    // Données et fichiers des autres comptes intacts, compteur corrigé.
    expect(storage.has(STORAGE_BUCKETS.uploads, otherMedia.originalPath)).toBe(true);
    const [post] = await db.select().from(posts).where(eq(posts.id, otherPost));
    expect(post?.likeCount).toBe(0);
  });

  it('rejouée après une purge complète → sans erreur', async () => {
    const gone = await deletedAccount();

    await run(gone);
    await run(gone);

    expect(customers.deleted).toEqual([gone, gone]);
  });

  it('RevenueCat ou PostHog injoignable → échec rejouable, la tentative suivante finit le travail', async () => {
    const gone = await deletedAccount();
    persons.unavailable = true;

    await expect(run(gone)).rejects.toThrow('HTTP 503');
    expect(await statusOf(gone)).toBeUndefined(); // base déjà purgée
    expect(customers.deleted).toEqual([gone]);

    persons.unavailable = false;
    await run(gone);

    expect(persons.deleted).toEqual([gone]);
  });

  it('sans PostHog configuré → purge faite, étape PostHog sautée', async () => {
    const gone = await deletedAccount();

    await purgeAccount({ db, storage, logger: silentLogger, customers, persons: null })(
      jobOf('purge-account', { profileId: gone }),
    );

    expect(await statusOf(gone)).toBeUndefined();
    expect(customers.deleted).toEqual([gone]);
  });

  it('compte non supprimé → rien n’est touché', async () => {
    const active = await rows.profile();

    await run(active);

    expect(await statusOf(active)).toBe('active');
    expect(customers.deleted).toEqual([]);
    expect(persons.deleted).toEqual([]);
  });

  it('payload invalide → échec définitif', async () => {
    await expect(run('pas-un-uuid')).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

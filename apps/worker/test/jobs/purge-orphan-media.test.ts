import { findMediaById, STORAGE_BUCKETS } from '@clone/db';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { variantPaths } from '../../src/jobs/process-image.ts';
import { purgeOrphanMedia } from '../../src/jobs/purge-orphan-media.ts';
import { connectTestDatabase } from '../support/database.ts';
import { jobOf, silentLogger, testRows } from '../support/fixtures.ts';
import { InMemoryStorage } from '../support/in-memory-storage.ts';

const database = connectTestDatabase();
const { db } = database;
const rows = testRows(db);

afterEach(() => rows.cleanUp());
afterAll(() => database.close());

describe('purge-orphan-media', () => {
  it('efface les médias jamais attachés après 24 h et les médias détachés, fichiers compris', async () => {
    const storage = new InMemoryStorage();
    const ownerId = await rows.profile();
    const dayAgo = sql`now() - interval '25 hours'`;
    const file = Buffer.from('x');

    const abandoned = await rows.media(ownerId, { status: 'pending_upload', createdAt: dayAgo });
    storage.put(STORAGE_BUCKETS.uploads, abandoned.originalPath, file);

    const replaced = await rows.media(ownerId, {
      status: 'ready',
      attachedAt: sql`now()`,
      detachedAt: sql`now()`,
    });
    const replacedVariants = variantPaths(replaced.id);
    const variantFiles: string[] = [
      replacedVariants.thumb,
      replacedVariants.medium,
      replacedVariants.large,
    ];
    await db.execute(
      sql`UPDATE media SET variants = ${JSON.stringify(replacedVariants)}::jsonb WHERE id = ${replaced.id}`,
    );
    for (const path of variantFiles) storage.put(STORAGE_BUCKETS.public, path, file);

    const recent = await rows.media(ownerId, { status: 'pending_upload' });
    const current = await rows.media(ownerId, {
      status: 'ready',
      createdAt: dayAgo,
      attachedAt: sql`now()`,
    });
    storage.put(STORAGE_BUCKETS.uploads, recent.originalPath, file);

    await purgeOrphanMedia({ db, storage, logger: silentLogger })(jobOf('purge-orphan-media', {}));

    await expect(findMediaById(db, abandoned.id)).resolves.toBeNull();
    await expect(findMediaById(db, replaced.id)).resolves.toBeNull();
    expect(storage.has(STORAGE_BUCKETS.uploads, abandoned.originalPath)).toBe(false);
    for (const path of variantFiles) {
      expect(storage.has(STORAGE_BUCKETS.public, path)).toBe(false);
    }

    await expect(findMediaById(db, recent.id)).resolves.not.toBeNull();
    await expect(findMediaById(db, current.id)).resolves.not.toBeNull();
    expect(storage.has(STORAGE_BUCKETS.uploads, recent.originalPath)).toBe(true);
  });
});

import { findMediaById, newId, postMedia, posts, STORAGE_BUCKETS } from '@clone/db';
import { UnrecoverableError } from 'bullmq';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { variantPaths } from '../../src/jobs/process-image.ts';
import { purgeContentFiles } from '../../src/jobs/purge-content-files.ts';
import { connectTestDatabase } from '../support/database.ts';
import { jobOf, silentLogger, testRows } from '../support/fixtures.ts';
import { InMemoryStorage } from '../support/in-memory-storage.ts';

const database = connectTestDatabase();
const { db } = database;
const rows = testRows(db);

afterEach(() => rows.cleanUp());
afterAll(() => database.close());

/** Post supprimé par modération : médias détachés, fichiers encore dans Storage. */
async function givenRemovedPost(storage: InMemoryStorage) {
  const ownerId = await rows.profile();
  const postId = newId();
  await db.insert(posts).values({
    id: postId,
    authorId: ownerId,
    kind: 'post',
    caption: '',
    deletedAt: sql`now()`,
  });
  const files: string[] = [];
  const mediaIds: string[] = [];
  for (const position of [0, 1]) {
    const { id, originalPath } = await rows.media(ownerId, {
      status: 'ready',
      purpose: 'post',
      attachedAt: sql`now()`,
      detachedAt: sql`now()`,
    });
    const variants = variantPaths(id);
    await db.execute(
      sql`UPDATE media SET variants = ${JSON.stringify(variants)}::jsonb WHERE id = ${id}`,
    );
    await db.insert(postMedia).values({ postId, mediaId: id, position });
    storage.put(STORAGE_BUCKETS.uploads, originalPath, Buffer.from('x'));
    for (const path of [variants.thumb, variants.medium, variants.large]) {
      storage.put(STORAGE_BUCKETS.public, path, Buffer.from('x'));
      files.push(path);
    }
    files.push(originalPath);
    mediaIds.push(id);
  }
  return { postId, mediaIds, files };
}

describe('purge-content-files', () => {
  it('efface les fichiers et les lignes des médias détachés du post, et se rejoue sans erreur', async () => {
    const storage = new InMemoryStorage();
    const { postId, mediaIds, files } = await givenRemovedPost(storage);
    const purge = purgeContentFiles({ db, storage, logger: silentLogger });

    await purge(jobOf('purge-content-files', { postId }));
    await purge(jobOf('purge-content-files', { postId }));

    for (const id of mediaIds) await expect(findMediaById(db, id)).resolves.toBeNull();
    for (const path of files) {
      expect(
        storage.has(STORAGE_BUCKETS.public, path) || storage.has(STORAGE_BUCKETS.uploads, path),
      ).toBe(false);
    }
  });

  it('ne touche pas aux médias encore attachés', async () => {
    const storage = new InMemoryStorage();
    const ownerId = await rows.profile();
    const postId = newId();
    await db.insert(posts).values({ id: postId, authorId: ownerId, kind: 'post', caption: '' });
    const { id, originalPath } = await rows.media(ownerId, {
      status: 'ready',
      purpose: 'post',
      attachedAt: sql`now()`,
    });
    await db.insert(postMedia).values({ postId, mediaId: id, position: 0 });
    storage.put(STORAGE_BUCKETS.uploads, originalPath, Buffer.from('x'));

    await purgeContentFiles({ db, storage, logger: silentLogger })(
      jobOf('purge-content-files', { postId }),
    );

    await expect(findMediaById(db, id)).resolves.not.toBeNull();
    expect(storage.has(STORAGE_BUCKETS.uploads, originalPath)).toBe(true);
  });

  it('payload invalide → échec définitif', async () => {
    const purge = purgeContentFiles({ db, storage: new InMemoryStorage(), logger: silentLogger });

    await expect(purge(jobOf('purge-content-files', { postId: 'x' }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});

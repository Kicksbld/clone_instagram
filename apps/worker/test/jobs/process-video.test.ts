import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { findMediaById, STORAGE_BUCKETS, media, newId, posts, postMedia } from '@clone/db';
import { afterAll, afterEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { purgeContentFiles } from '../../src/jobs/purge-content-files.ts';
import { processVideo } from '../../src/jobs/process-video.ts';
import { connectTestDatabase } from '../support/database.ts';
import { jobOf, silentLogger, testRows } from '../support/fixtures.ts';
import { InMemoryStorage } from '../support/in-memory-storage.ts';
const database = connectTestDatabase();
const rows = testRows(database.db);
afterEach(() => rows.cleanUp());
afterAll(() => database.close());
it('vidéo sans son → HLS sans agrandissement et miniature ; rejouée sans doublon', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reel-test-'));
  try {
    await promisify(execFile)('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=180x320:r=12',
      '-t',
      '2',
      '-c:v',
      'libx264',
      join(directory, 'source.mp4'),
    ]);
    const file = await readFile(join(directory, 'source.mp4'));
    const ownerId = await rows.profile();
    const { id, originalPath } = await rows.media(ownerId, {
      kind: 'video',
      purpose: 'post',
      mimeType: 'video/mp4',
    });
    const storage = new InMemoryStorage();
    storage.put(STORAGE_BUCKETS.uploads, originalPath, file);
    const handler = processVideo({ db: database.db, storage, logger: silentLogger });
    await expect(handler(jobOf('process-video', { mediaId: id }))).resolves.toEqual({
      mediaId: id,
      ownerId,
    });
    expect(storage.get(STORAGE_BUCKETS.public, `${id}/hls/master.m3u8`)?.toString()).toContain(
      '180x320',
    );
    expect(storage.has(STORAGE_BUCKETS.public, `${id}/thumbnail.webp`)).toBe(true);
    expect(storage.has(STORAGE_BUCKETS.uploads, originalPath)).toBe(false);
    await expect(findMediaById(database.db, id)).resolves.toMatchObject({
      status: 'ready',
      width: 180,
      height: 320,
      durationMs: 2000,
    });
    const writes = storage.uploads;
    await handler(jobOf('process-video', { mediaId: id }));
    expect(storage.uploads).toBe(writes);
    await database.db
      .update(media)
      .set({ attachedAt: new Date(), detachedAt: new Date() })
      .where(eq(media.id, id));
    const postId = newId();
    await database.db
      .insert(posts)
      .values({ id: postId, authorId: ownerId, kind: 'reel', caption: '', deletedAt: new Date() });
    await database.db.insert(postMedia).values({ postId, mediaId: id, position: 0 });
    await purgeContentFiles({ db: database.db, storage, logger: silentLogger })(
      jobOf('purge-content-files', { postId }),
    );
    expect(
      [...storage.files.keys()].some((path) => path.startsWith(`${STORAGE_BUCKETS.public}/${id}/`)),
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

it.each([
  ['illisible', Buffer.from('not a video'), 'invalid_video'],
  ['trop lourd', Buffer.alloc(50 * 1024 * 1024 + 1), 'file_too_large'],
])('%s → refus définitif', async (_name, file, reason) => {
  const ownerId = await rows.profile();
  const { id, originalPath } = await rows.media(ownerId, { kind: 'video', purpose: 'post' });
  const storage = new InMemoryStorage();
  storage.put(STORAGE_BUCKETS.uploads, originalPath, file);
  await expect(
    processVideo({ db: database.db, storage, logger: silentLogger })(
      jobOf('process-video', { mediaId: id }),
    ),
  ).rejects.toThrow();
  await expect(findMediaById(database.db, id)).resolves.toMatchObject({
    status: 'failed',
    failureReason: reason,
  });
});

it.each([
  [
    '61 secondes',
    ['-f', 'lavfi', '-i', 'color=s=64x96:r=1', '-t', '61', '-c:v', 'libx264'],
    'video_too_long',
  ],
  [
    'audio seul',
    ['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:a', 'aac'],
    'invalid_video',
  ],
])('%s → failed avec le motif précis', async (_label, args, reason) => {
  const directory = await mkdtemp(join(tmpdir(), 'reel-invalid-'));
  try {
    const source = join(directory, 'source.mp4');
    await promisify(execFile)('ffmpeg', ['-y', ...args, source]);
    const ownerId = await rows.profile();
    const { id, originalPath } = await rows.media(ownerId, { kind: 'video', purpose: 'post' });
    const storage = new InMemoryStorage();
    storage.put(STORAGE_BUCKETS.uploads, originalPath, await readFile(source));
    await expect(
      processVideo({ db: database.db, storage, logger: silentLogger })(
        jobOf('process-video', { mediaId: id }),
      ),
    ).rejects.toThrow();
    await expect(findMediaById(database.db, id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: reason,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('MP4 aux en-têtes valides mais données vidéo corrompues → invalid_video', async () => {
  const file = await readFile(
    new URL('../../../../ios/CloneInstagramTests/Fixtures/reel-source.mp4', import.meta.url),
  );
  const marker = file.indexOf(Buffer.from('mdat'));
  const size = file.readUInt32BE(marker - 4);
  file.fill(0, marker + 4, marker - 4 + size);
  const ownerId = await rows.profile();
  const { id, originalPath } = await rows.media(ownerId, { kind: 'video', purpose: 'post' });
  const storage = new InMemoryStorage();
  storage.put(STORAGE_BUCKETS.uploads, originalPath, file);
  await expect(
    processVideo({ db: database.db, storage, logger: silentLogger })(
      jobOf('process-video', { mediaId: id }),
    ),
  ).rejects.toThrow();
  await expect(findMediaById(database.db, id)).resolves.toMatchObject({
    status: 'failed',
    failureReason: 'invalid_video',
  });
});

it('transfert Storage bloqué → délai global et processing_error à la dernière tentative', async () => {
  const ownerId = await rows.profile();
  const { id } = await rows.media(ownerId, { kind: 'video', purpose: 'post' });
  class StalledStorage extends InMemoryStorage {
    override download(): Promise<Buffer | null> {
      return new Promise(() => {});
    }
  }
  const handler = processVideo({
    db: database.db,
    storage: new StalledStorage(),
    logger: silentLogger,
    timeoutMs: 100,
  });
  await expect(handler(jobOf('process-video', { mediaId: id }, 2))).rejects.toThrow('trop long');
  await expect(findMediaById(database.db, id)).resolves.toMatchObject({
    status: 'failed',
    failureReason: 'processing_error',
  });
});

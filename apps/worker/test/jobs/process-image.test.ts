import { findMediaById, STORAGE_BUCKETS } from '@clone/db';
import { UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { processImage, variantPaths } from '../../src/jobs/process-image.ts';
import { connectTestDatabase } from '../support/database.ts';
import { gif, jobOf, jpegWithGps, png, silentLogger, testRows } from '../support/fixtures.ts';
import { InMemoryStorage } from '../support/in-memory-storage.ts';

const database = connectTestDatabase();
const { db } = database;
const rows = testRows(db);
let storage: InMemoryStorage;
let handler: ReturnType<typeof processImage>;

beforeEach(() => {
  storage = new InMemoryStorage();
  handler = processImage({ db, storage, logger: silentLogger });
});
afterEach(() => rows.cleanUp());
afterAll(() => database.close());

const run = (mediaId: unknown, attemptsMade = 0) =>
  handler(jobOf('process-image', { mediaId }, attemptsMade));

async function uploaded(file: Buffer) {
  const ownerId = await rows.profile();
  const media = await rows.media(ownerId);
  storage.put(STORAGE_BUCKETS.uploads, media.originalPath, file);
  return { ...media, ownerId };
}

describe('process-image', () => {
  it('image avec EXIF GPS → variantes WebP sans métadonnées, média ready, original supprimé', async () => {
    const original = await jpegWithGps(2000, 1500);
    expect(await sharp(original).metadata()).toMatchObject({ orientation: 6 });
    expect(original.includes('iPhone 17')).toBe(true);
    const { id, ownerId, originalPath } = await uploaded(original);

    await expect(run(id)).resolves.toEqual({ mediaId: id, ownerId });

    const paths = variantPaths(id);
    // Orientation 6 appliquée : 1500 × 2000 affichés.
    const expected = { thumb: 150, medium: 640, large: 1080 };
    for (const [name, width] of Object.entries(expected)) {
      const file = storage.get(STORAGE_BUCKETS.public, paths[name as keyof typeof paths]);
      if (!file) throw new Error(`Variante ${name} absente`);
      const metadata = await sharp(file).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      expect(file.includes('iPhone')).toBe(false);
    }
    expect(storage.has(STORAGE_BUCKETS.uploads, originalPath)).toBe(false);
    await expect(findMediaById(db, id)).resolves.toMatchObject({
      status: 'ready',
      variants: paths,
      width: 1500,
      height: 2000,
    });
  });

  it('petite image PNG → variantes jamais agrandies', async () => {
    const { id } = await uploaded(await png(100, 80));

    await run(id);

    const large = storage.get(STORAGE_BUCKETS.public, variantPaths(id).large);
    if (!large) throw new Error('Variante large absente');
    expect(await sharp(large).metadata()).toMatchObject({ width: 100, height: 80 });
  });

  it.each([
    ['texte déguisé en JPEG', () => Promise.resolve(Buffer.from('ceci n’est pas une image'))],
    ['GIF', gif],
  ])('%s → failed invalid_image, sans nouvelle tentative', async (_label, file) => {
    const { id, originalPath } = await uploaded(await file());

    await expect(run(id)).rejects.toBeInstanceOf(UnrecoverableError);

    await expect(findMediaById(db, id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'invalid_image',
    });
    expect(storage.uploads).toBe(0);
    // Original conservé pour la relance (P2), jusqu'à la purge.
    expect(storage.has(STORAGE_BUCKETS.uploads, originalPath)).toBe(true);
  });

  it('plus de 20 Mo → failed file_too_large', async () => {
    const { id } = await uploaded(Buffer.alloc(20 * 1024 * 1024 + 1));

    await expect(run(id)).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(findMediaById(db, id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'file_too_large',
    });
  });

  it('original absent → failed processing_error', async () => {
    const ownerId = await rows.profile();
    const { id } = await rows.media(ownerId);

    await expect(run(id)).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(findMediaById(db, id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'processing_error',
    });
  });

  it.each([
    ['sans mediaId', {}],
    ['mediaId qui n’est pas un UUID', { mediaId: 'abc' }],
  ])('payload invalide (%s) → échec définitif', async (_label, data) => {
    await expect(handler(jobOf('process-image', data))).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('job rejoué sur un média ready → même résultat, aucune nouvelle variante', async () => {
    const { id, ownerId } = await uploaded(await png(300, 300));
    await run(id);
    const writes = storage.uploads;

    await expect(run(id)).resolves.toEqual({ mediaId: id, ownerId });
    expect(storage.uploads).toBe(writes);
  });

  it('tentative interrompue en processing → reprise', async () => {
    const ownerId = await rows.profile();
    const media = await rows.media(ownerId, { status: 'processing' });
    storage.put(STORAGE_BUCKETS.uploads, media.originalPath, await png(200, 200));

    await run(media.id);

    await expect(findMediaById(db, media.id)).resolves.toMatchObject({ status: 'ready' });
  });

  it('erreur passagère → nouvelle tentative ; à la dernière, failed processing_error', async () => {
    const { id } = await uploaded(await png(200, 200));
    storage.failUploads = true;

    await expect(run(id, 0)).rejects.toThrow('Storage indisponible');
    await expect(findMediaById(db, id)).resolves.toMatchObject({ status: 'processing' });

    await expect(run(id, 2)).rejects.toThrow('Storage indisponible');
    await expect(findMediaById(db, id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'processing_error',
    });
  });
});

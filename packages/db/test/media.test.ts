import { eq, inArray, sql } from 'drizzle-orm';
import type { PgInsertValue } from 'drizzle-orm/pg-core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { newId } from '../src/ids.ts';
import {
  attachMedia,
  deletePurgeableMedia,
  detachMedia,
  findPurgeableMedia,
  markFailed,
  markProcessing,
  markReady,
  markUploaded,
} from '../src/media.ts';
import { media, type MediaStatus } from '../src/schema/media.ts';
import { profiles } from '../src/schema/profiles.ts';
import { connectTestDatabase } from './support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const createdProfiles: string[] = [];

afterEach(async () => {
  // La suppression des profils supprime leurs médias (ON DELETE CASCADE).
  if (createdProfiles.length > 0)
    await db.delete(profiles).where(inArray(profiles.id, createdProfiles));
  createdProfiles.length = 0;
});

afterAll(() => database.close());

const variants = { thumb: 'm/thumb.webp', medium: 'm/medium.webp', large: 'm/large.webp' };

async function givenProfile(): Promise<string> {
  const id = newId();
  await db.insert(profiles).values({
    id,
    username: `t${id.replaceAll('-', '').slice(-20)}`,
    fullName: 'Test',
    birthDate: '2000-01-01',
  });
  createdProfiles.push(id);
  return id;
}

async function givenMedia(
  ownerId: string,
  values: Partial<PgInsertValue<typeof media>> = {},
): Promise<string> {
  const id = newId();
  await db.insert(media).values({
    id,
    ownerId,
    kind: 'image',
    purpose: 'avatar',
    originalPath: `${ownerId}/${id}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    ...values,
  });
  return id;
}

async function statusOf(id: string): Promise<MediaStatus | undefined> {
  const [row] = await db.select({ status: media.status }).from(media).where(eq(media.id, id));
  return row?.status;
}

describe('transitions de statut', () => {
  it('enchaîne pending_upload → uploaded → processing → ready', async () => {
    const id = await givenMedia(await givenProfile());

    expect(await markUploaded(db, id)).toBe(true);
    expect(await markProcessing(db, id)).toBe(true);
    expect(await markReady(db, id, { variants, width: 800, height: 600 })).toBe(true);

    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row).toMatchObject({ status: 'ready', variants, width: 800, height: 600 });
    expect(row?.processedAt).toBeInstanceOf(Date);
  });

  it('refuse une transition depuis un autre statut que celui attendu', async () => {
    const id = await givenMedia(await givenProfile());

    expect(await markProcessing(db, id)).toBe(false);
    expect(await markReady(db, id, { variants, width: 1, height: 1 })).toBe(false);
    expect(await statusOf(id)).toBe('pending_upload');

    await markUploaded(db, id);
    expect(await markUploaded(db, id)).toBe(false);
  });

  it('passe en failed avec son motif, seulement depuis processing', async () => {
    const id = await givenMedia(await givenProfile(), { status: 'uploaded' });

    expect(await markFailed(db, id, 'invalid_image')).toBe(false);
    await markProcessing(db, id);
    expect(await markFailed(db, id, 'invalid_image')).toBe(true);

    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row).toMatchObject({ status: 'failed', failureReason: 'invalid_image' });
  });

  it('ne touche pas un média inexistant', async () => {
    expect(await markUploaded(db, newId())).toBe(false);
  });
});

describe('rattachement', () => {
  it('attache un média prêt, à son propriétaire, du bon purpose, une seule fois', async () => {
    const ownerId = await givenProfile();
    const id = await givenMedia(ownerId, { status: 'ready', variants });

    expect(await attachMedia(db, { id, ownerId, purpose: 'avatar' })).toBe(true);
    expect(await attachMedia(db, { id, ownerId, purpose: 'avatar' })).toBe(false);
  });

  it('refuse le média d’un autre, pas prêt, ou d’un autre purpose', async () => {
    const ownerId = await givenProfile();
    const otherId = await givenProfile();
    const ready = await givenMedia(ownerId, { status: 'ready', variants });
    const processing = await givenMedia(ownerId, { status: 'processing' });
    const post = await givenMedia(ownerId, { status: 'ready', variants, purpose: 'post' });

    expect(await attachMedia(db, { id: ready, ownerId: otherId, purpose: 'avatar' })).toBe(false);
    expect(await attachMedia(db, { id: processing, ownerId, purpose: 'avatar' })).toBe(false);
    expect(await attachMedia(db, { id: post, ownerId, purpose: 'avatar' })).toBe(false);
  });

  it('détache un média attaché une seule fois, et ne le rattache jamais', async () => {
    const ownerId = await givenProfile();
    const id = await givenMedia(ownerId, { status: 'ready', variants });

    expect(await detachMedia(db, id)).toBe(false);
    await attachMedia(db, { id, ownerId, purpose: 'avatar' });
    expect(await detachMedia(db, id)).toBe(true);
    expect(await detachMedia(db, id)).toBe(false);
    expect(await attachMedia(db, { id, ownerId, purpose: 'avatar' })).toBe(false);
  });

  it('libère la photo de profil quand son média est supprimé', async () => {
    const ownerId = await givenProfile();
    const id = await givenMedia(ownerId, { status: 'ready', variants });
    await db.update(profiles).set({ avatarMediaId: id }).where(eq(profiles.id, ownerId));

    await db.delete(media).where(eq(media.id, id));

    const [row] = await db.select().from(profiles).where(eq(profiles.id, ownerId));
    expect(row?.avatarMediaId).toBeNull();
  });
});

describe('purge', () => {
  const dayAndMinuteAgo = sql`now() - interval '24 hours 1 minute'`;

  it('sélectionne les médias jamais attachés depuis 24 h et les médias détachés', async () => {
    const ownerId = await givenProfile();
    const abandoned = await givenMedia(ownerId, { createdAt: dayAndMinuteAgo });
    const recent = await givenMedia(ownerId);
    const attached = await givenMedia(ownerId, {
      status: 'ready',
      createdAt: dayAndMinuteAgo,
      attachedAt: sql`now()`,
    });
    const detached = await givenMedia(ownerId, {
      status: 'ready',
      variants,
      attachedAt: sql`now()`,
      detachedAt: sql`now()`,
    });

    const ids = (await findPurgeableMedia(db, 1000)).map((row) => row.id);

    expect(ids).toEqual(expect.arrayContaining([abandoned, detached]));
    expect(ids).not.toContain(recent);
    expect(ids).not.toContain(attached);
  });

  it('ne supprime que si le média est toujours à purger', async () => {
    const ownerId = await givenProfile();
    const detached = await givenMedia(ownerId, {
      status: 'ready',
      attachedAt: sql`now()`,
      detachedAt: sql`now()`,
    });
    const attached = await givenMedia(ownerId, { status: 'ready', attachedAt: sql`now()` });

    expect(await deletePurgeableMedia(db, detached)).toBe(true);
    expect(await deletePurgeableMedia(db, attached)).toBe(false);
    expect(await statusOf(detached)).toBeUndefined();
    expect(await statusOf(attached)).toBe('ready');
  });
});

describe('contraintes', () => {
  it('refuse un détachement sans rattachement et un motif d’échec hors failed', async () => {
    const ownerId = await givenProfile();

    await expect(givenMedia(ownerId, { detachedAt: sql`now()` })).rejects.toThrow();
    await expect(givenMedia(ownerId, { failureReason: 'invalid_image' })).rejects.toThrow();
  });
});

import { markProcessing, markReady, media, newId, profiles, type Executor } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { RemoveAvatar } from '../../../src/modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from '../../../src/modules/identity/application/use-cases/update-me.ts';
import { DrizzleProfileRepository } from '../../../src/modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { MediaNotReadyError } from '../../../src/modules/media/domain/errors.ts';
import { DrizzleMediaRepository } from '../../../src/modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const { db } = database;
const mediaRepository = new DrizzleMediaRepository(db);
const profileRepository = new DrizzleProfileRepository(db);
const transaction = new DrizzleUnitOfWork(db, (tx: Executor) => ({
  profiles: new DrizzleProfileRepository(tx),
  media: new DrizzleMediaRepository(tx),
}));
const created: string[] = [];

afterEach(async () => {
  // Supprimer les profils supprime leurs médias (ON DELETE CASCADE).
  if (created.length > 0) await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
});

afterAll(() => database.close());

async function givenProfile(): Promise<string> {
  const id = newId();
  created.push(id);
  await profileRepository.create({
    id,
    username: `t_${id.replaceAll('-', '').slice(-20)}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
  });
  return id;
}

async function givenMedia(ownerId: string, options: { ready?: boolean } = {}): Promise<string> {
  const id = newId();
  await mediaRepository.create({
    id,
    ownerId,
    kind: 'image',
    purpose: 'avatar',
    originalPath: `${ownerId}/${id}`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
  });
  if (options.ready) {
    await mediaRepository.markUploaded(id);
    await markProcessing(db, id);
    await markReady(db, id, {
      variants: {
        thumb: `${id}/thumb.webp`,
        medium: `${id}/medium.webp`,
        large: `${id}/large.webp`,
      },
      width: 1080,
      height: 1080,
    });
  }
  return id;
}

describe('DrizzleMediaRepository', () => {
  it('crée puis relit un média en pending_upload', async () => {
    const ownerId = await givenProfile();
    const id = await givenMedia(ownerId);

    await expect(mediaRepository.findById(id)).resolves.toEqual({
      id,
      ownerId,
      kind: 'image',
      purpose: 'avatar',
      status: 'pending_upload',
      originalPath: `${ownerId}/${id}`,
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
      variants: null,
      failureReason: null,
      attachedAt: null,
    });
  });

  it('propriétaire sans profil → null', async () => {
    const ownerId = newId();
    await expect(
      mediaRepository.create({
        id: newId(),
        ownerId,
        kind: 'image',
        purpose: 'avatar',
        originalPath: `${ownerId}/x`,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
      }),
    ).resolves.toBeNull();
  });

  it('markUploaded : une seule fois', async () => {
    const id = await givenMedia(await givenProfile());
    await expect(mediaRepository.markUploaded(id)).resolves.toBe(true);
    await expect(mediaRepository.markUploaded(id)).resolves.toBe(false);
  });
});

describe('photo de profil en transaction', () => {
  const setAvatar = (userId: string, avatarMediaId: string) =>
    new UpdateMe(profileRepository, transaction).execute({ userId, changes: { avatarMediaId } });

  it('attache la photo, détache l’ancienne et relit les variantes', async () => {
    const me = await givenProfile();
    const oldPhoto = await givenMedia(me, { ready: true });
    const photo = await givenMedia(me, { ready: true });
    await setAvatar(me, oldPhoto);

    const profile = await setAvatar(me, photo);

    expect(profile.avatar).toEqual({
      mediaId: photo,
      variants: {
        thumb: `${photo}/thumb.webp`,
        medium: `${photo}/medium.webp`,
        large: `${photo}/large.webp`,
      },
    });
    const [old] = await db.select().from(media).where(eq(media.id, oldPhoto));
    expect(old?.detachedAt).toBeInstanceOf(Date);
  });

  it('refus → transaction annulée, photo actuelle intacte', async () => {
    const me = await givenProfile();
    const photo = await givenMedia(me, { ready: true });
    const notReady = await givenMedia(me);
    await setAvatar(me, photo);

    await expect(setAvatar(me, notReady)).rejects.toBeInstanceOf(MediaNotReadyError);

    await expect(profileRepository.findById(me)).resolves.toMatchObject({
      avatar: { mediaId: photo },
    });
    const [current] = await db.select().from(media).where(eq(media.id, photo));
    expect(current?.detachedAt).toBeNull();
  });

  it('retrait : profil sans photo, média détaché', async () => {
    const me = await givenProfile();
    const photo = await givenMedia(me, { ready: true });
    await setAvatar(me, photo);

    await expect(new RemoveAvatar(transaction).execute({ userId: me })).resolves.toMatchObject({
      avatar: null,
    });
    const [row] = await db.select().from(media).where(eq(media.id, photo));
    expect(row?.detachedAt).toBeInstanceOf(Date);
  });
});

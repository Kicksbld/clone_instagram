import { beforeEach, describe, expect, it } from 'vitest';

import { RemoveAvatar } from '../../../src/modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from '../../../src/modules/identity/application/use-cases/update-me.ts';
import { ProfileNotFoundError } from '../../../src/modules/identity/domain/errors.ts';
import { CompleteUpload } from '../../../src/modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from '../../../src/modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from '../../../src/modules/media/application/use-cases/request-upload.ts';
import {
  MediaAlreadyAttachedError,
  MediaInvalidTransitionError,
  MediaNotFoundError,
  MediaNotReadyError,
  MediaPurposeMismatchError,
} from '../../../src/modules/media/domain/errors.ts';
import { FakeMediaStorage, InMemoryJobQueue, sequentialIds } from '../../support/fakes.ts';
import { inMemoryAdapters, TEST_NOW } from '../../support/test-app.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const PHOTO = '0199a1b2-0000-7000-9000-000000000001';
const OLD_PHOTO = '0199a1b2-0000-7000-9000-000000000002';

let adapters: ReturnType<typeof inMemoryAdapters>;
let jobs: InMemoryJobQueue;

beforeEach(() => {
  adapters = inMemoryAdapters();
  jobs = new InMemoryJobQueue();
  adapters.profiles.add({ id: ME, username: 'killian' });
  adapters.profiles.add({ id: OTHER, username: 'autre' });
});

describe('RequestUpload', () => {
  const upload = {
    kind: 'image',
    purpose: 'avatar',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
  } as const;
  const requestUpload = () =>
    new RequestUpload(adapters.media, new FakeMediaStorage(() => TEST_NOW), sequentialIds());

  it('crée le média en pending_upload et renvoie une URL présignée', async () => {
    const intent = await requestUpload().execute({ userId: ME, ...upload });

    expect(intent).toEqual({
      mediaId: PHOTO,
      uploadUrl: `https://storage.test/upload/uploads/${ME}/${PHOTO}?token=test`,
      expiresAt: new Date('2026-09-25T14:00:00.000Z'),
    });
    expect(adapters.media.rows.get(PHOTO)).toMatchObject({
      ownerId: ME,
      status: 'pending_upload',
      originalPath: `${ME}/${PHOTO}`,
      sizeBytes: 2048,
    });
  });

  it('sans profil → profile_not_found', async () => {
    await expect(
      requestUpload().execute({ userId: '0199a1b2-0000-7000-8000-000000000009', ...upload }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('CompleteUpload', () => {
  const complete = (mediaId: string, userId = ME) =>
    new CompleteUpload(adapters.media, jobs).execute({ userId, mediaId });

  it('passe le média en uploaded et enfile son traitement', async () => {
    adapters.media.add({ id: PHOTO, ownerId: ME });

    await expect(complete(PHOTO)).resolves.toMatchObject({ status: 'uploaded' });
    expect(adapters.media.rows.get(PHOTO)?.status).toBe('uploaded');
    expect([...jobs.imageProcessing]).toEqual([PHOTO]);
  });

  it('rappelé sur un média uploaded, relance le traitement sans doublon', async () => {
    adapters.media.add({ id: PHOTO, ownerId: ME });
    await complete(PHOTO);

    await expect(complete(PHOTO)).resolves.toMatchObject({ status: 'uploaded' });
    expect([...jobs.imageProcessing]).toEqual([PHOTO]);
  });

  it.each(['processing', 'ready', 'failed'] as const)(
    'média %s → media_invalid_transition',
    async (status) => {
      adapters.media.add({ id: PHOTO, ownerId: ME, status });
      await expect(complete(PHOTO)).rejects.toBeInstanceOf(MediaInvalidTransitionError);
      expect(jobs.imageProcessing.size).toBe(0);
    },
  );

  it('média d’un autre utilisateur ou inexistant → media_not_found', async () => {
    adapters.media.add({ id: PHOTO, ownerId: OTHER });
    await expect(complete(PHOTO)).rejects.toBeInstanceOf(MediaNotFoundError);
    await expect(complete(OLD_PHOTO)).rejects.toBeInstanceOf(MediaNotFoundError);
    expect(adapters.media.rows.get(PHOTO)?.status).toBe('pending_upload');
  });
});

describe('GetMedia', () => {
  it('renvoie mon média, jamais celui d’un autre', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: ME });
    const getMedia = new GetMedia(adapters.media);

    await expect(getMedia.execute({ userId: ME, mediaId: PHOTO })).resolves.toMatchObject({
      status: 'ready',
    });
    await expect(getMedia.execute({ userId: OTHER, mediaId: PHOTO })).rejects.toBeInstanceOf(
      MediaNotFoundError,
    );
  });
});

describe('UpdateMe avec avatarMediaId', () => {
  const setAvatar = (avatarMediaId: string, changes = {}) =>
    new UpdateMe(adapters.profiles, adapters.avatarTransaction).execute({
      userId: ME,
      changes: { ...changes, avatarMediaId },
    });

  it('attache le média prêt et renvoie la photo avec ses variantes', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: ME });

    const profile = await setAvatar(PHOTO, { bio: ' Dev ' });

    expect(profile.bio).toBe('Dev');
    expect(profile.avatar).toEqual({
      mediaId: PHOTO,
      variants: {
        thumb: `${PHOTO}/thumb.webp`,
        medium: `${PHOTO}/medium.webp`,
        large: `${PHOTO}/large.webp`,
      },
    });
    expect(adapters.media.rows.get(PHOTO)?.attachedAt).not.toBeNull();
  });

  it('remplace la photo : l’ancienne est détachée, donc purgée', async () => {
    adapters.media.addReady({ id: OLD_PHOTO, ownerId: ME });
    adapters.media.addReady({ id: PHOTO, ownerId: ME });
    await setAvatar(OLD_PHOTO);

    const profile = await setAvatar(PHOTO);

    expect(profile.avatar?.mediaId).toBe(PHOTO);
    expect(adapters.media.rows.get(OLD_PHOTO)?.detachedAt).not.toBeNull();
    expect(adapters.media.rows.get(PHOTO)?.detachedAt).toBeNull();
  });

  it('même photo qu’actuellement → aucun changement de média', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: ME });
    await setAvatar(PHOTO);

    await expect(setAvatar(PHOTO)).resolves.toMatchObject({ avatar: { mediaId: PHOTO } });
    expect(adapters.media.rows.get(PHOTO)?.detachedAt).toBeNull();
  });

  it('média d’un autre utilisateur → media_not_found', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: OTHER });
    await expect(setAvatar(PHOTO)).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it('média inexistant → media_not_found', async () => {
    await expect(setAvatar(PHOTO)).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it.each(['pending_upload', 'uploaded', 'processing', 'failed'] as const)(
    'média %s → media_not_ready',
    async (status) => {
      adapters.media.add({ id: PHOTO, ownerId: ME, status });
      await expect(setAvatar(PHOTO)).rejects.toBeInstanceOf(MediaNotReadyError);
    },
  );

  it('purpose incohérent → media_purpose_mismatch', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: ME, purpose: 'post' });
    await expect(setAvatar(PHOTO)).rejects.toBeInstanceOf(MediaPurposeMismatchError);
  });

  it('média déjà utilisé → media_already_attached', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: ME, attachedAt: TEST_NOW });
    await expect(setAvatar(PHOTO)).rejects.toBeInstanceOf(MediaAlreadyAttachedError);
  });

  it('refus → la photo actuelle reste en place', async () => {
    adapters.media.addReady({ id: OLD_PHOTO, ownerId: ME });
    adapters.media.addReady({ id: PHOTO, ownerId: OTHER });
    await setAvatar(OLD_PHOTO);

    await expect(setAvatar(PHOTO)).rejects.toBeInstanceOf(MediaNotFoundError);

    expect(adapters.profiles.rows.get(ME)?.avatar?.mediaId).toBe(OLD_PHOTO);
    expect(adapters.media.rows.get(OLD_PHOTO)?.detachedAt).toBeNull();
  });
});

describe('RemoveAvatar', () => {
  const removeAvatar = (userId = ME) =>
    new RemoveAvatar(adapters.avatarTransaction).execute({ userId });

  it('retire la photo et détache son média', async () => {
    adapters.media.addReady({ id: PHOTO, ownerId: ME });
    await new UpdateMe(adapters.profiles, adapters.avatarTransaction).execute({
      userId: ME,
      changes: { avatarMediaId: PHOTO },
    });

    await expect(removeAvatar()).resolves.toMatchObject({ avatar: null });
    expect(adapters.media.rows.get(PHOTO)?.detachedAt).not.toBeNull();
  });

  it('sans photo → ne change rien', async () => {
    await expect(removeAvatar()).resolves.toMatchObject({ id: ME, avatar: null });
  });

  it('profil absent → profile_not_found', async () => {
    await expect(removeAvatar('0199a1b2-0000-7000-8000-000000000009')).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });
});

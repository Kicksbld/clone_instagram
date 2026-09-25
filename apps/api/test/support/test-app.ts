import { buildApp } from '../../src/app.ts';
import { CheckUsernameAvailability } from '../../src/modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from '../../src/modules/identity/application/use-cases/complete-onboarding.ts';
import { GetMe } from '../../src/modules/identity/application/use-cases/get-me.ts';
import { RemoveAvatar } from '../../src/modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from '../../src/modules/identity/application/use-cases/update-me.ts';
import { CompleteUpload } from '../../src/modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from '../../src/modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from '../../src/modules/media/application/use-cases/request-upload.ts';
import { publicMediaUrls } from '../../src/shared/infrastructure/http/public-media-urls.ts';
import { FakeMediaStorage, InMemoryJobQueue, InMemoryUnitOfWork, sequentialIds } from './fakes.ts';
import { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import { testTokenVerifier } from './tokens.ts';

export const TEST_NOW = new Date('2026-09-25T12:00:00.000Z');
export const TEST_MEDIA_BASE_URL = 'http://192.168.1.20:54321';

/** Adapters en mémoire reliés entre eux (profils ↔ médias), comme en base. */
export function inMemoryAdapters() {
  const profiles = new InMemoryProfileRepository(() => TEST_NOW);
  const media = new InMemoryMediaRepository((ownerId) => profiles.rows.has(ownerId));
  profiles.media = media;
  const avatarTransaction = new InMemoryUnitOfWork({ profiles, media });
  return { profiles, media, avatarTransaction };
}

/** App HTTP complète avec des adapters en mémoire et une horloge fixe. */
export function buildTestApp() {
  const { profiles, media, avatarTransaction } = inMemoryAdapters();
  const jobs = new InMemoryJobQueue();
  const clock = { now: () => TEST_NOW };
  const app = buildApp({
    logLevel: 'silent',
    dependencies: {
      tokenVerifier: testTokenVerifier,
      identity: {
        getMe: new GetMe(profiles),
        updateMe: new UpdateMe(profiles, avatarTransaction),
        removeAvatar: new RemoveAvatar(avatarTransaction),
        completeOnboarding: new CompleteOnboarding(profiles, clock),
        checkUsernameAvailability: new CheckUsernameAvailability(profiles),
      },
      media: {
        requestUpload: new RequestUpload(media, new FakeMediaStorage(clock.now), sequentialIds()),
        completeUpload: new CompleteUpload(media, jobs),
        getMedia: new GetMedia(media),
      },
      mediaUrls: publicMediaUrls(TEST_MEDIA_BASE_URL),
    },
  });
  return { app, profiles, media, jobs };
}

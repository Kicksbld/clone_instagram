// Composition root (ADR-005) : configuration, puis assemblage manuel des dépendances.
import { createDatabase, type Executor } from '@clone/db';
import { StorageClient } from '@supabase/storage-js';

import { buildApp } from './app.ts';
import { CheckUsernameAvailability } from './modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from './modules/identity/application/use-cases/complete-onboarding.ts';
import { GetMe } from './modules/identity/application/use-cases/get-me.ts';
import { RemoveAvatar } from './modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from './modules/identity/application/use-cases/update-me.ts';
import { DrizzleProfileRepository } from './modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { CompleteUpload } from './modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from './modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from './modules/media/application/use-cases/request-upload.ts';
import { DrizzleMediaRepository } from './modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { SupabaseMediaStorage } from './modules/media/infrastructure/storage/supabase-media-storage.ts';
import { createJwtVerifier, supabaseJwks } from './shared/infrastructure/auth/token-verifier.ts';
import { loadConfig } from './shared/infrastructure/config.ts';
import { publicMediaUrls } from './shared/infrastructure/http/public-media-urls.ts';
import { BullMqJobQueue } from './shared/infrastructure/jobs/bullmq-job-queue.ts';
import { DrizzleUnitOfWork } from './shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { systemClock } from './shared/infrastructure/system-clock.ts';
import { uuidV7Generator } from './shared/infrastructure/uuid-v7-generator.ts';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

const profiles = new DrizzleProfileRepository(database.db);
const media = new DrizzleMediaRepository(database.db);
const avatarTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  profiles: new DrizzleProfileRepository(tx),
  media: new DrizzleMediaRepository(tx),
}));
const jobs = new BullMqJobQueue(config.REDIS_URL);
const secretKey = config.SUPABASE_SERVICE_ROLE_KEY;
const storage = new SupabaseMediaStorage(
  new StorageClient(new URL('/storage/v1', config.SUPABASE_URL).toString(), {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
  }),
  config.PUBLIC_MEDIA_BASE_URL,
  () => systemClock.now(),
);

const app = buildApp({
  logLevel: config.LOG_LEVEL,
  dependencies: {
    tokenVerifier: createJwtVerifier({
      issuer: config.SUPABASE_JWT_ISSUER,
      keys: supabaseJwks(config.SUPABASE_URL),
    }),
    identity: {
      getMe: new GetMe(profiles),
      updateMe: new UpdateMe(profiles, avatarTransaction),
      removeAvatar: new RemoveAvatar(avatarTransaction),
      completeOnboarding: new CompleteOnboarding(profiles, systemClock),
      checkUsernameAvailability: new CheckUsernameAvailability(profiles),
    },
    media: {
      requestUpload: new RequestUpload(media, storage, uuidV7Generator),
      completeUpload: new CompleteUpload(media, jobs),
      getMedia: new GetMedia(media),
    },
    mediaUrls: publicMediaUrls(config.PUBLIC_MEDIA_BASE_URL),
  },
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Arrêt de l’API');
  await app.close();
  await jobs.close();
  await database.close();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });

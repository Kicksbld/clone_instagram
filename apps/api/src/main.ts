// Composition root (ADR-005) : configuration, puis assemblage manuel des dépendances.
import { createDatabase, type Executor } from '@clone/db';
import { StorageClient } from '@supabase/storage-js';

import { buildApp } from './app.ts';
import { CheckUsernameAvailability } from './modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from './modules/identity/application/use-cases/complete-onboarding.ts';
import { GetMe } from './modules/identity/application/use-cases/get-me.ts';
import { GetProfile } from './modules/identity/application/use-cases/get-profile.ts';
import { RemoveAvatar } from './modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from './modules/identity/application/use-cases/update-me.ts';
import { DrizzleProfileRepository } from './modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { CompleteUpload } from './modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from './modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from './modules/media/application/use-cases/request-upload.ts';
import { DrizzleMediaRepository } from './modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { SupabaseMediaStorage } from './modules/media/infrastructure/storage/supabase-media-storage.ts';
import { CreatePost } from './modules/posts/application/use-cases/create-post.ts';
import { GetPost } from './modules/posts/application/use-cases/get-post.ts';
import { ListUserPosts } from './modules/posts/application/use-cases/list-user-posts.ts';
import {
  DrizzlePostReader,
  DrizzlePostRepository,
} from './modules/posts/infrastructure/persistence/drizzle-post-repository.ts';
import { FollowUser } from './modules/social/application/use-cases/follow-user.ts';
import { ListFollowers } from './modules/social/application/use-cases/list-followers.ts';
import { ListFollowing } from './modules/social/application/use-cases/list-following.ts';
import { SearchUsers } from './modules/social/application/use-cases/search-users.ts';
import { UnfollowUser } from './modules/social/application/use-cases/unfollow-user.ts';
import { DrizzleAccountReader } from './modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import {
  DrizzleFollowCounters,
  DrizzleFollowRepository,
} from './modules/social/infrastructure/persistence/drizzle-follow-repository.ts';
import { DrizzleSocialGraphReader } from './modules/social/infrastructure/persistence/drizzle-social-graph-reader.ts';
import { createJwtVerifier, supabaseJwks } from './shared/infrastructure/auth/token-verifier.ts';
import { loadConfig } from './shared/infrastructure/config.ts';
import { publicMediaUrls } from './shared/infrastructure/http/public-media-urls.ts';
import { BullMqJobQueue } from './shared/infrastructure/jobs/bullmq-job-queue.ts';
import { DrizzleRelationshipReader } from './shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from './shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { systemClock } from './shared/infrastructure/system-clock.ts';
import { uuidV7Generator } from './shared/infrastructure/uuid-v7-generator.ts';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

const profiles = new DrizzleProfileRepository(database.db);
const media = new DrizzleMediaRepository(database.db);
const relationships = new DrizzleRelationshipReader(database.db);
const avatarTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  profiles: new DrizzleProfileRepository(tx),
  media: new DrizzleMediaRepository(tx),
}));
const accounts = new DrizzleAccountReader(database.db);
const socialGraph = new DrizzleSocialGraphReader(database.db);
const followTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  follows: new DrizzleFollowRepository(tx),
  counters: new DrizzleFollowCounters(tx),
}));
const postReader = new DrizzlePostReader(database.db);
const createPostTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  media: new DrizzleMediaRepository(tx),
  posts: new DrizzlePostRepository(tx),
  reader: new DrizzlePostReader(tx),
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
      getProfile: new GetProfile(profiles, relationships),
    },
    media: {
      requestUpload: new RequestUpload(media, storage, uuidV7Generator),
      completeUpload: new CompleteUpload(media, jobs),
      getMedia: new GetMedia(media),
    },
    social: {
      followUser: new FollowUser(followTransaction),
      unfollowUser: new UnfollowUser(followTransaction),
      listFollowers: new ListFollowers(accounts, relationships, socialGraph),
      listFollowing: new ListFollowing(accounts, relationships, socialGraph),
      searchUsers: new SearchUsers(socialGraph),
    },
    posts: {
      createPost: new CreatePost(createPostTransaction, uuidV7Generator, systemClock),
      getPost: new GetPost(postReader, relationships),
      listUserPosts: new ListUserPosts(accounts, relationships, postReader),
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

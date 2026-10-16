// Composition root (ADR-005) : configuration, puis assemblage manuel des dépendances.
import { createDatabase, type Executor } from '@clone/db';
import { StorageClient } from '@supabase/storage-js';

import { buildApp } from './app.ts';
import { GetPlan } from './modules/billing/application/use-cases/get-plan.ts';
import { RefreshSubscription } from './modules/billing/application/use-cases/refresh-subscription.ts';
import { DrizzleSubscriptionRepository } from './modules/billing/infrastructure/persistence/drizzle-subscription-repository.ts';
import { RevenueCatSubscriptionProvider } from './modules/billing/infrastructure/revenuecat/revenuecat-subscription-provider.ts';
import { CreateComment } from './modules/engagement/application/use-cases/create-comment.ts';
import { DeleteComment } from './modules/engagement/application/use-cases/delete-comment.ts';
import { LikePost } from './modules/engagement/application/use-cases/like-post.ts';
import { ListComments } from './modules/engagement/application/use-cases/list-comments.ts';
import { ListReplies } from './modules/engagement/application/use-cases/list-replies.ts';
import { UnlikePost } from './modules/engagement/application/use-cases/unlike-post.ts';
import {
  DrizzleCommentReader,
  DrizzleCommentRepository,
} from './modules/engagement/infrastructure/persistence/drizzle-comments.ts';
import {
  DrizzleLikeablePostReader,
  DrizzleLikeRepository,
} from './modules/engagement/infrastructure/persistence/drizzle-likes.ts';
import { GetFeed } from './modules/feed/application/use-cases/get-feed.ts';
import { DrizzleFeedReader } from './modules/feed/infrastructure/persistence/drizzle-feed-reader.ts';
import { CheckUsernameAvailability } from './modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from './modules/identity/application/use-cases/complete-onboarding.ts';
import { DeleteMe } from './modules/identity/application/use-cases/delete-me.ts';
import { DeleteUserAsAdmin } from './modules/identity/application/use-cases/delete-user-as-admin.ts';
import { GetAdminSession } from './modules/identity/application/use-cases/get-admin-session.ts';
import { GetMe } from './modules/identity/application/use-cases/get-me.ts';
import { GetProfile } from './modules/identity/application/use-cases/get-profile.ts';
import { GetUserForAdmin } from './modules/identity/application/use-cases/get-user-for-admin.ts';
import { ListUsersForAdmin } from './modules/identity/application/use-cases/list-users-for-admin.ts';
import { ModerateUser } from './modules/identity/application/use-cases/moderate-user.ts';
import { RemoveAvatar } from './modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from './modules/identity/application/use-cases/update-me.ts';
import { UpdateSettings } from './modules/identity/application/use-cases/update-settings.ts';
import { DrizzleAdminUserReader } from './modules/identity/infrastructure/persistence/drizzle-admin-user-reader.ts';
import { DrizzleProfileRepository } from './modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { SupabaseAuthAccounts } from './modules/identity/infrastructure/supabase/supabase-auth-accounts.ts';
import { CompleteUpload } from './modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from './modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from './modules/media/application/use-cases/request-upload.ts';
import { DrizzleMediaRepository } from './modules/media/infrastructure/persistence/drizzle-media-repository.ts';
import { SupabaseMediaStorage } from './modules/media/infrastructure/storage/supabase-media-storage.ts';
import { CreateReport } from './modules/moderation/application/use-cases/create-report.ts';
import {
  DrizzleReportRepository,
  DrizzleReportTargetReader,
} from './modules/moderation/infrastructure/persistence/drizzle-reports.ts';
import { DrizzleUserReportsReader } from './modules/moderation/infrastructure/persistence/drizzle-user-reports-reader.ts';
import { CreatePost } from './modules/posts/application/use-cases/create-post.ts';
import { DeletePost } from './modules/posts/application/use-cases/delete-post.ts';
import { GetPost } from './modules/posts/application/use-cases/get-post.ts';
import { ListUserPosts } from './modules/posts/application/use-cases/list-user-posts.ts';
import {
  DrizzlePostReader,
  DrizzlePostRepository,
} from './modules/posts/infrastructure/persistence/drizzle-post-repository.ts';
import { BlockUser } from './modules/social/application/use-cases/block-user.ts';
import { FollowUser } from './modules/social/application/use-cases/follow-user.ts';
import { ListBlocks } from './modules/social/application/use-cases/list-blocks.ts';
import { ListFollowers } from './modules/social/application/use-cases/list-followers.ts';
import { ListFollowing } from './modules/social/application/use-cases/list-following.ts';
import { SearchUsers } from './modules/social/application/use-cases/search-users.ts';
import { UnblockUser } from './modules/social/application/use-cases/unblock-user.ts';
import { UnfollowUser } from './modules/social/application/use-cases/unfollow-user.ts';
import { DrizzleAccountReader } from './modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import { DrizzleBlockRepository } from './modules/social/infrastructure/persistence/drizzle-block-repository.ts';
import {
  DrizzleFollowCounters,
  DrizzleFollowRepository,
} from './modules/social/infrastructure/persistence/drizzle-follow-repository.ts';
import { DrizzleSocialGraphReader } from './modules/social/infrastructure/persistence/drizzle-social-graph-reader.ts';
import {
  noopAnalyticsTracker,
  PostHogAnalyticsTracker,
} from './shared/infrastructure/analytics/posthog-analytics-tracker.ts';
import { createJwtVerifier, supabaseJwks } from './shared/infrastructure/auth/token-verifier.ts';
import { loadConfig } from './shared/infrastructure/config.ts';
import { publicMediaUrls } from './shared/infrastructure/http/public-media-urls.ts';
import { BullMqJobQueue } from './shared/infrastructure/jobs/bullmq-job-queue.ts';
import { DrizzleAccountStatusReader } from './shared/infrastructure/persistence/drizzle-account-status-reader.ts';
import { DrizzleAdminAuditLog } from './shared/infrastructure/persistence/drizzle-admin-audit-log.ts';
import { DrizzleAdminRoles } from './shared/infrastructure/persistence/drizzle-admin-roles.ts';
import { DrizzleRelationshipReader } from './shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from './shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { systemClock } from './shared/infrastructure/system-clock.ts';
import { uuidV7Generator } from './shared/infrastructure/uuid-v7-generator.ts';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
// Analytics jamais bloquants (ADR-013) : échec journalisé sans les propriétés de l'événement.
const posthog = config.POSTHOG_PROJECT_API_KEY
  ? new PostHogAnalyticsTracker({
      apiKey: config.POSTHOG_PROJECT_API_KEY,
      host: config.POSTHOG_HOST,
      onError: (error) => {
        app.log.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'PostHog : envoi échoué',
        );
      },
    })
  : null;
const analytics = posthog ?? noopAnalyticsTracker;

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
const blockTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  blocks: new DrizzleBlockRepository(tx),
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
const deletePostTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  media: new DrizzleMediaRepository(tx),
  posts: new DrizzlePostRepository(tx),
}));
const likeTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  posts: new DrizzleLikeablePostReader(tx),
  likes: new DrizzleLikeRepository(tx),
}));
const commentTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  posts: new DrizzleLikeablePostReader(tx),
  comments: new DrizzleCommentRepository(tx),
  reader: new DrizzleCommentReader(tx),
}));
const commentReader = new DrizzleCommentReader(database.db);
const subscriptions = new DrizzleSubscriptionRepository(database.db);
const jobs = new BullMqJobQueue(config.REDIS_URL);
const secretKey = config.SUPABASE_SERVICE_ROLE_KEY;
const authAccounts = new SupabaseAuthAccounts({ supabaseUrl: config.SUPABASE_URL, secretKey });
const adminRoles = new DrizzleAdminRoles(database.db);
// Action d'administration et journal d'audit dans une même transaction (ADR-011).
const adminTransaction = new DrizzleUnitOfWork(database.db, (tx: Executor) => ({
  profiles: new DrizzleProfileRepository(tx),
  audit: new DrizzleAdminAuditLog(tx),
}));
const getPlan = new GetPlan(subscriptions, systemClock);
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
    accountStatuses: new DrizzleAccountStatusReader(database.db),
    identity: {
      getMe: new GetMe(profiles),
      updateMe: new UpdateMe(profiles, avatarTransaction),
      updateSettings: new UpdateSettings(profiles),
      removeAvatar: new RemoveAvatar(avatarTransaction),
      deleteMe: new DeleteMe(profiles, authAccounts, jobs),
      completeOnboarding: new CompleteOnboarding(profiles, systemClock, analytics),
      checkUsernameAvailability: new CheckUsernameAvailability(profiles),
      getProfile: new GetProfile(profiles, relationships),
      getPlan,
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
      blockUser: new BlockUser(blockTransaction),
      unblockUser: new UnblockUser(accounts, new DrizzleBlockRepository(database.db)),
      listBlocks: new ListBlocks(socialGraph),
    },
    posts: {
      createPost: new CreatePost(createPostTransaction, uuidV7Generator, systemClock, analytics),
      deletePost: new DeletePost(deletePostTransaction),
      getPost: new GetPost(postReader, relationships),
      listUserPosts: new ListUserPosts(accounts, relationships, postReader),
    },
    feed: {
      getFeed: new GetFeed(new DrizzleFeedReader(database.db)),
    },
    engagement: {
      likePost: new LikePost(likeTransaction),
      unlikePost: new UnlikePost(likeTransaction),
      createComment: new CreateComment(commentTransaction, uuidV7Generator, systemClock),
      listComments: new ListComments(
        relationships,
        new DrizzleLikeablePostReader(database.db),
        commentReader,
      ),
      listReplies: new ListReplies(
        relationships,
        new DrizzleCommentRepository(database.db),
        commentReader,
      ),
      deleteComment: new DeleteComment(commentTransaction),
    },
    billing: {
      refreshSubscription: new RefreshSubscription(
        accounts,
        subscriptions,
        new RevenueCatSubscriptionProvider({
          secretKey: config.REVENUECAT_SECRET_KEY,
          projectId: config.REVENUECAT_PROJECT_ID,
        }),
        systemClock,
        analytics,
      ),
    },
    moderation: {
      createReport: new CreateReport(
        new DrizzleReportTargetReader(database.db),
        relationships,
        new DrizzleReportRepository(database.db),
        uuidV7Generator,
      ),
    },
    admin: {
      getAdminSession: new GetAdminSession(adminRoles),
      listUsers: new ListUsersForAdmin(adminRoles, new DrizzleAdminUserReader(database.db)),
      getUser: new GetUserForAdmin(adminRoles, profiles, new DrizzleUserReportsReader(database.db)),
      moderateUser: new ModerateUser(adminRoles, adminTransaction),
      deleteUser: new DeleteUserAsAdmin(adminRoles, profiles, authAccounts, adminTransaction, jobs),
      getPlan,
    },
    mediaUrls: publicMediaUrls(config.PUBLIC_MEDIA_BASE_URL),
  },
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Arrêt de l’API');
  await app.close();
  await jobs.close();
  await posthog?.shutdown();
  await database.close();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });

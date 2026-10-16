import { buildApp } from '../../src/app.ts';
import { GetPlan } from '../../src/modules/billing/application/use-cases/get-plan.ts';
import { RefreshSubscription } from '../../src/modules/billing/application/use-cases/refresh-subscription.ts';
import { CreateComment } from '../../src/modules/engagement/application/use-cases/create-comment.ts';
import { DeleteComment } from '../../src/modules/engagement/application/use-cases/delete-comment.ts';
import { LikePost } from '../../src/modules/engagement/application/use-cases/like-post.ts';
import { ListComments } from '../../src/modules/engagement/application/use-cases/list-comments.ts';
import { ListReplies } from '../../src/modules/engagement/application/use-cases/list-replies.ts';
import { UnlikePost } from '../../src/modules/engagement/application/use-cases/unlike-post.ts';
import { GetFeed } from '../../src/modules/feed/application/use-cases/get-feed.ts';
import { CheckUsernameAvailability } from '../../src/modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from '../../src/modules/identity/application/use-cases/complete-onboarding.ts';
import { DeleteMe } from '../../src/modules/identity/application/use-cases/delete-me.ts';
import { GetMe } from '../../src/modules/identity/application/use-cases/get-me.ts';
import { GetProfile } from '../../src/modules/identity/application/use-cases/get-profile.ts';
import { RemoveAvatar } from '../../src/modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from '../../src/modules/identity/application/use-cases/update-me.ts';
import { UpdateSettings } from '../../src/modules/identity/application/use-cases/update-settings.ts';
import { CompleteUpload } from '../../src/modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from '../../src/modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from '../../src/modules/media/application/use-cases/request-upload.ts';
import { CreateReport } from '../../src/modules/moderation/application/use-cases/create-report.ts';
import { CreatePost } from '../../src/modules/posts/application/use-cases/create-post.ts';
import { DeletePost } from '../../src/modules/posts/application/use-cases/delete-post.ts';
import { GetPost } from '../../src/modules/posts/application/use-cases/get-post.ts';
import { ListUserPosts } from '../../src/modules/posts/application/use-cases/list-user-posts.ts';
import { BlockUser } from '../../src/modules/social/application/use-cases/block-user.ts';
import { FollowUser } from '../../src/modules/social/application/use-cases/follow-user.ts';
import { ListBlocks } from '../../src/modules/social/application/use-cases/list-blocks.ts';
import { ListFollowers } from '../../src/modules/social/application/use-cases/list-followers.ts';
import { ListFollowing } from '../../src/modules/social/application/use-cases/list-following.ts';
import { SearchUsers } from '../../src/modules/social/application/use-cases/search-users.ts';
import { UnblockUser } from '../../src/modules/social/application/use-cases/unblock-user.ts';
import { UnfollowUser } from '../../src/modules/social/application/use-cases/unfollow-user.ts';
import { publicMediaUrls } from '../../src/shared/infrastructure/http/public-media-urls.ts';
import {
  FakeMediaStorage,
  InMemoryAnalyticsTracker,
  InMemoryAuthAccounts,
  InMemoryJobQueue,
  InMemoryUnitOfWork,
  sequentialIds,
} from './fakes.ts';
import { InMemorySubscriptionProvider, InMemorySubscriptions } from './in-memory-billing.ts';
import { InMemoryComments } from './in-memory-comments.ts';
import { InMemoryFeedReader } from './in-memory-feed.ts';
import { InMemoryLikes } from './in-memory-likes.ts';
import { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import { InMemoryPosts } from './in-memory-posts.ts';
import { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';
import { InMemoryReports } from './in-memory-reports.ts';
import { InMemoryBlocks, InMemorySocialGraph } from './in-memory-social-graph.ts';
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
  const relationships = new InMemoryRelationshipReader();
  const graph = new InMemorySocialGraph(profiles, relationships);
  const followTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    follows: graph,
    counters: graph,
  });
  const blocks = new InMemoryBlocks(relationships);
  const blockTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    blocks,
    follows: graph,
    counters: graph,
  });
  const posts = new InMemoryPosts(profiles, media);
  const createPostTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    media,
    posts,
    reader: posts,
  });
  const likes = new InMemoryLikes(posts);
  const likeTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    posts: likes,
    likes,
  });
  const comments = new InMemoryComments(profiles, posts, relationships);
  const commentTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    posts: likes,
    comments,
    reader: comments,
  });
  const reports = new InMemoryReports(profiles, likes, comments);
  const clock = { now: () => TEST_NOW };
  const subscriptions = new InMemorySubscriptions();
  const subscriptionProvider = new InMemorySubscriptionProvider();
  const analytics = new InMemoryAnalyticsTracker();
  const authAccounts = new InMemoryAuthAccounts();
  const app = buildApp({
    logLevel: 'silent',
    dependencies: {
      tokenVerifier: testTokenVerifier,
      accountStatuses: profiles,
      identity: {
        getMe: new GetMe(profiles),
        updateMe: new UpdateMe(profiles, avatarTransaction),
        updateSettings: new UpdateSettings(profiles),
        removeAvatar: new RemoveAvatar(avatarTransaction),
        deleteMe: new DeleteMe(profiles, authAccounts, jobs),
        completeOnboarding: new CompleteOnboarding(profiles, clock, analytics),
        checkUsernameAvailability: new CheckUsernameAvailability(profiles),
        getProfile: new GetProfile(profiles, relationships),
        getPlan: new GetPlan(subscriptions, clock),
      },
      media: {
        requestUpload: new RequestUpload(media, new FakeMediaStorage(clock.now), sequentialIds()),
        completeUpload: new CompleteUpload(media, jobs),
        getMedia: new GetMedia(media),
      },
      social: {
        followUser: new FollowUser(followTransaction),
        unfollowUser: new UnfollowUser(followTransaction),
        listFollowers: new ListFollowers(graph, relationships, graph),
        listFollowing: new ListFollowing(graph, relationships, graph),
        searchUsers: new SearchUsers(graph),
        blockUser: new BlockUser(blockTransaction),
        unblockUser: new UnblockUser(graph, blocks),
        listBlocks: new ListBlocks(graph),
      },
      posts: {
        createPost: new CreatePost(
          createPostTransaction,
          sequentialIds('0199a1b2-0000-7000-a000-'),
          clock,
          analytics,
        ),
        deletePost: new DeletePost(new InMemoryUnitOfWork({ media, posts })),
        getPost: new GetPost(posts, relationships),
        listUserPosts: new ListUserPosts(graph, relationships, posts),
      },
      feed: {
        getFeed: new GetFeed(new InMemoryFeedReader(posts, relationships)),
      },
      engagement: {
        likePost: new LikePost(likeTransaction),
        unlikePost: new UnlikePost(likeTransaction),
        createComment: new CreateComment(
          commentTransaction,
          sequentialIds('0199a1b2-0000-7000-b100-'),
          clock,
        ),
        listComments: new ListComments(relationships, likes, comments),
        listReplies: new ListReplies(relationships, comments, comments),
        deleteComment: new DeleteComment(commentTransaction),
      },
      billing: {
        refreshSubscription: new RefreshSubscription(
          graph,
          subscriptions,
          subscriptionProvider,
          clock,
          analytics,
        ),
      },
      moderation: {
        createReport: new CreateReport(
          reports,
          relationships,
          reports,
          sequentialIds('0199a1b2-0000-7000-c100-'),
        ),
      },
      mediaUrls: publicMediaUrls(TEST_MEDIA_BASE_URL),
    },
  });
  return {
    app,
    profiles,
    media,
    jobs,
    relationships,
    posts,
    comments,
    subscriptions,
    subscriptionProvider,
    analytics,
    reports,
    authAccounts,
  };
}

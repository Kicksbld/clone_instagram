import { GetOrCreateConversation } from '../../src/modules/messaging/application/use-cases/get-or-create-conversation.ts';
import { ListConversations } from '../../src/modules/messaging/application/use-cases/list-conversations.ts';
import { ListMessages } from '../../src/modules/messaging/application/use-cases/list-messages.ts';
import { SendMessage } from '../../src/modules/messaging/application/use-cases/send-message.ts';
import { InMemoryMessaging } from './in-memory-messaging.ts';
import { ListArchivedStories } from '../../src/modules/ephemeral/application/use-cases/list-archived-stories.ts';
import { ListStoryViewers } from '../../src/modules/ephemeral/application/use-cases/list-story-viewers.ts';
import { RealtimeBroker } from '../../src/shared/infrastructure/realtime/realtime.ts';
import { buildApp } from '../../src/app.ts';
import { GetActivity } from '../../src/modules/activity/application/use-cases/get-activity.ts';
import { MarkActivityRead } from '../../src/modules/activity/application/use-cases/mark-activity-read.ts';
import { GetPlan } from '../../src/modules/billing/application/use-cases/get-plan.ts';
import { RefreshSubscription } from '../../src/modules/billing/application/use-cases/refresh-subscription.ts';
import { CreateComment } from '../../src/modules/engagement/application/use-cases/create-comment.ts';
import { DeleteComment } from '../../src/modules/engagement/application/use-cases/delete-comment.ts';
import { LikePost } from '../../src/modules/engagement/application/use-cases/like-post.ts';
import { ListComments } from '../../src/modules/engagement/application/use-cases/list-comments.ts';
import { ListReplies } from '../../src/modules/engagement/application/use-cases/list-replies.ts';
import { UnlikePost } from '../../src/modules/engagement/application/use-cases/unlike-post.ts';
import { DeleteStory } from '../../src/modules/ephemeral/application/use-cases/delete-story.ts';
import { GetStoryTray } from '../../src/modules/ephemeral/application/use-cases/get-story-tray.ts';
import { GetUserStories } from '../../src/modules/ephemeral/application/use-cases/get-user-stories.ts';
import { PublishStory } from '../../src/modules/ephemeral/application/use-cases/publish-story.ts';
import { ViewStory } from '../../src/modules/ephemeral/application/use-cases/view-story.ts';
import { GetFeed } from '../../src/modules/feed/application/use-cases/get-feed.ts';
import { CheckUsernameAvailability } from '../../src/modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from '../../src/modules/identity/application/use-cases/complete-onboarding.ts';
import { DeleteMe } from '../../src/modules/identity/application/use-cases/delete-me.ts';
import { DeleteUserAsAdmin } from '../../src/modules/identity/application/use-cases/delete-user-as-admin.ts';
import { GetAdminSession } from '../../src/modules/identity/application/use-cases/get-admin-session.ts';
import { GetMe } from '../../src/modules/identity/application/use-cases/get-me.ts';
import { GetProfile } from '../../src/modules/identity/application/use-cases/get-profile.ts';
import { GetUserForAdmin } from '../../src/modules/identity/application/use-cases/get-user-for-admin.ts';
import { ListUsersForAdmin } from '../../src/modules/identity/application/use-cases/list-users-for-admin.ts';
import { ModerateUser } from '../../src/modules/identity/application/use-cases/moderate-user.ts';
import { RemoveAvatar } from '../../src/modules/identity/application/use-cases/remove-avatar.ts';
import { UpdateMe } from '../../src/modules/identity/application/use-cases/update-me.ts';
import { UpdateSettings } from '../../src/modules/identity/application/use-cases/update-settings.ts';
import { CompleteUpload } from '../../src/modules/media/application/use-cases/complete-upload.ts';
import { GetMedia } from '../../src/modules/media/application/use-cases/get-media.ts';
import { RequestUpload } from '../../src/modules/media/application/use-cases/request-upload.ts';
import { CreateReport } from '../../src/modules/moderation/application/use-cases/create-report.ts';
import { GetReportForAdmin } from '../../src/modules/moderation/application/use-cases/get-report-for-admin.ts';
import { ListReportsForAdmin } from '../../src/modules/moderation/application/use-cases/list-reports-for-admin.ts';
import { ResolveReport } from '../../src/modules/moderation/application/use-cases/resolve-report.ts';
import { CreatePost } from '../../src/modules/posts/application/use-cases/create-post.ts';
import { DeletePost } from '../../src/modules/posts/application/use-cases/delete-post.ts';
import { GetPost } from '../../src/modules/posts/application/use-cases/get-post.ts';
import { ListUserPosts } from '../../src/modules/posts/application/use-cases/list-user-posts.ts';
import { AcceptFollowRequest } from '../../src/modules/social/application/use-cases/accept-follow-request.ts';
import { AddCloseFriend } from '../../src/modules/social/application/use-cases/add-close-friend.ts';
import { BlockUser } from '../../src/modules/social/application/use-cases/block-user.ts';
import { DeclineFollowRequest } from '../../src/modules/social/application/use-cases/decline-follow-request.ts';
import { FollowUser } from '../../src/modules/social/application/use-cases/follow-user.ts';
import { ListBlocks } from '../../src/modules/social/application/use-cases/list-blocks.ts';
import { ListCloseFriends } from '../../src/modules/social/application/use-cases/list-close-friends.ts';
import { ListFollowRequests } from '../../src/modules/social/application/use-cases/list-follow-requests.ts';
import { ListFollowers } from '../../src/modules/social/application/use-cases/list-followers.ts';
import { ListFollowing } from '../../src/modules/social/application/use-cases/list-following.ts';
import { RemoveCloseFriend } from '../../src/modules/social/application/use-cases/remove-close-friend.ts';
import { RemoveFollower } from '../../src/modules/social/application/use-cases/remove-follower.ts';
import { SearchUsers } from '../../src/modules/social/application/use-cases/search-users.ts';
import { UnblockUser } from '../../src/modules/social/application/use-cases/unblock-user.ts';
import { UnfollowUser } from '../../src/modules/social/application/use-cases/unfollow-user.ts';
import { SocialFollowRequestAccepter } from '../../src/modules/social/infrastructure/follow-request-accepter.ts';
import { publicMediaUrls } from '../../src/shared/infrastructure/http/public-media-urls.ts';
import {
  FakeMediaStorage,
  InMemoryAdminAuditLog,
  InMemoryAdminRoles,
  InMemoryAnalyticsTracker,
  InMemoryAuthAccounts,
  InMemoryJobQueue,
  InMemoryUnitOfWork,
  InMemoryUserReports,
  sequentialIds,
} from './fakes.ts';
import { InMemoryAdminReports } from './in-memory-admin-reports.ts';
import { InMemorySubscriptionProvider, InMemorySubscriptions } from './in-memory-billing.ts';
import { InMemoryComments } from './in-memory-comments.ts';
import { InMemoryFeedReader } from './in-memory-feed.ts';
import { InMemoryLikes } from './in-memory-likes.ts';
import { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import {
  InMemoryActivity,
  InMemoryNotificationDispatcher,
  InMemoryNotifications,
} from './in-memory-notifications.ts';
import { InMemoryPosts } from './in-memory-posts.ts';
import { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';
import { InMemoryReports } from './in-memory-reports.ts';
import { InMemoryStories } from './in-memory-stories.ts';
import {
  InMemoryBlocks,
  InMemoryCloseFriends,
  InMemoryFollowRequests,
  InMemorySocialGraph,
} from './in-memory-social-graph.ts';
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
  const messaging = new InMemoryMessaging(profiles, relationships);
  const messagingTransaction = new InMemoryUnitOfWork({ repository: messaging, relationships });
  const messagingIds = sequentialIds('0199a1b2-0000-7000-d100-');
  const messagingUseCases = {
    getOrCreateConversation: new GetOrCreateConversation(messagingTransaction, messagingIds, {
      now: () => TEST_NOW,
    }),
    listConversations: new ListConversations(messaging),
    listMessages: new ListMessages(messaging, relationships),
    sendMessage: new SendMessage(
      messagingTransaction,
      messagingIds,
      { now: () => TEST_NOW },
      {
        publish: (ids, event) => {
          realtime.publish(ids, event);
        },
        disconnect: () => {},
      },
    ),
  };
  const graph = new InMemorySocialGraph(profiles, relationships);
  const notifications = new InMemoryNotifications(relationships);
  const notificationDispatcher = new InMemoryNotificationDispatcher();
  const requests = new InMemoryFollowRequests(relationships);
  const followTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    follows: graph,
    requests,
    counters: graph,
    notifications,
  });
  const settingsTransaction = new InMemoryUnitOfWork({
    profiles,
    followRequests: new SocialFollowRequestAccepter({
      follows: graph,
      requests,
      counters: graph,
      notifications,
    }),
  });
  const blocks = new InMemoryBlocks(relationships);
  const closeFriends = new InMemoryCloseFriends(relationships);
  const blockTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    blocks,
    follows: graph,
    requests,
    closeFriends,
    counters: graph,
    notifications,
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
    notifications,
  });
  const comments = new InMemoryComments(profiles, posts, relationships);
  const commentTransaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    posts: likes,
    comments,
    reader: comments,
    notifications,
  });
  const activity = new InMemoryActivity(
    notifications,
    profiles,
    media,
    posts,
    comments,
    relationships,
  );
  const reports = new InMemoryReports(profiles, likes, comments);
  const clock = { now: () => TEST_NOW };
  const subscriptions = new InMemorySubscriptions();
  const subscriptionProvider = new InMemorySubscriptionProvider();
  const analytics = new InMemoryAnalyticsTracker();
  const authAccounts = new InMemoryAuthAccounts();
  const adminRoles = new InMemoryAdminRoles();
  const auditLog = new InMemoryAdminAuditLog();
  const userReports = new InMemoryUserReports();
  const adminTransaction = new InMemoryUnitOfWork({ profiles, audit: auditLog });
  const getPlan = new GetPlan(subscriptions, clock);
  const adminReports = new InMemoryAdminReports(reports, profiles, posts, comments, TEST_NOW);
  const resolveReportTransaction = new InMemoryUnitOfWork({
    reports: adminReports,
    posts,
    media,
    comments,
    audit: auditLog,
  });
  const stories = new InMemoryStories(profiles, media, relationships);
  const realtime = new RealtimeBroker(() => undefined);
  const app = buildApp({
    logLevel: 'silent',
    dependencies: {
      messaging: messagingUseCases,
      realtime,
      tokenVerifier: testTokenVerifier,
      accountStatuses: profiles,
      identity: {
        getMe: new GetMe(profiles),
        updateMe: new UpdateMe(profiles, avatarTransaction),
        updateSettings: new UpdateSettings(settingsTransaction, notificationDispatcher),
        removeAvatar: new RemoveAvatar(avatarTransaction),
        deleteMe: new DeleteMe(profiles, authAccounts, jobs, realtime),
        completeOnboarding: new CompleteOnboarding(profiles, clock, analytics),
        checkUsernameAvailability: new CheckUsernameAvailability(profiles),
        getProfile: new GetProfile(profiles, relationships),
        getPlan,
      },
      media: {
        requestUpload: new RequestUpload(media, new FakeMediaStorage(clock.now), sequentialIds()),
        completeUpload: new CompleteUpload(media, jobs),
        getMedia: new GetMedia(media),
      },
      social: {
        followUser: new FollowUser(followTransaction, notificationDispatcher),
        unfollowUser: new UnfollowUser(followTransaction),
        listFollowers: new ListFollowers(graph, relationships, graph),
        listFollowing: new ListFollowing(graph, relationships, graph),
        searchUsers: new SearchUsers(graph),
        blockUser: new BlockUser(blockTransaction),
        unblockUser: new UnblockUser(graph, blocks),
        listBlocks: new ListBlocks(graph),
        removeFollower: new RemoveFollower(followTransaction),
        listFollowRequests: new ListFollowRequests(graph),
        acceptFollowRequest: new AcceptFollowRequest(followTransaction, notificationDispatcher),
        declineFollowRequest: new DeclineFollowRequest(followTransaction),
        listCloseFriends: new ListCloseFriends(graph),
        addCloseFriend: new AddCloseFriend(
          new InMemoryUnitOfWork({ accounts: graph, relationships, closeFriends }),
        ),
        removeCloseFriend: new RemoveCloseFriend(graph, closeFriends),
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
      stories: {
        listArchivedStories: new ListArchivedStories(stories, clock),
        listStoryViewers: new ListStoryViewers(stories, {
          isPlus: async (userId) => (await getPlan.execute({ userId })).plan === 'plus',
        }),
        publishStory: new PublishStory(
          new InMemoryUnitOfWork({ accounts: graph, media, stories, reader: stories }),
          { isPlus: async (userId) => (await getPlan.execute({ userId })).plan === 'plus' },
          sequentialIds('0199a1b2-0000-7000-e100-'),
          clock,
        ),
        getStoryTray: new GetStoryTray(stories, clock),
        getUserStories: new GetUserStories(graph, relationships, stories, clock),
        viewStory: new ViewStory(
          new InMemoryUnitOfWork({ relationships, reader: stories, stories }),
          clock,
          { isPlus: async (userId) => (await getPlan.execute({ userId })).plan === 'plus' },
        ),
        deleteStory: new DeleteStory(new InMemoryUnitOfWork({ media, stories })),
      },
      engagement: {
        likePost: new LikePost(likeTransaction, notificationDispatcher),
        unlikePost: new UnlikePost(likeTransaction),
        createComment: new CreateComment(
          commentTransaction,
          sequentialIds('0199a1b2-0000-7000-b100-'),
          clock,
          notificationDispatcher,
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
      activity: {
        getActivity: new GetActivity(activity),
        markActivityRead: new MarkActivityRead(activity),
      },
      admin: {
        getAdminSession: new GetAdminSession(adminRoles),
        listUsers: new ListUsersForAdmin(adminRoles, profiles),
        getUser: new GetUserForAdmin(adminRoles, profiles, userReports),
        moderateUser: new ModerateUser(adminRoles, adminTransaction, realtime),
        deleteUser: new DeleteUserAsAdmin(
          adminRoles,
          profiles,
          authAccounts,
          adminTransaction,
          jobs,
          realtime,
        ),
        getPlan,
      },
      adminReports: {
        listReports: new ListReportsForAdmin(adminRoles, adminReports),
        getReport: new GetReportForAdmin(adminRoles, adminReports, profiles),
        resolveReport: new ResolveReport(adminRoles, resolveReportTransaction, jobs),
      },
      mediaUrls: publicMediaUrls(TEST_MEDIA_BASE_URL),
    },
  });
  return {
    app,
    realtime,
    profiles,
    media,
    jobs,
    relationships,
    posts,
    stories,
    comments,
    notifications,
    notificationDispatcher,
    subscriptions,
    subscriptionProvider,
    analytics,
    reports,
    adminReports,
    authAccounts,
    adminRoles,
    auditLog,
    userReports,
  };
}

import type {
  FeedQuery,
  FeedReader,
  FriendsReelEntry,
} from '../../src/modules/feed/application/ports/feed-reader.ts';
import type { FriendInteractionRow } from '../../src/modules/feed/domain/feed.ts';
import type { Post } from '../../src/modules/posts/domain/post.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import { canViewContent, isMutual, type Relationship } from '../../src/shared/domain/visibility.ts';
import type { InMemoryComments } from './in-memory-comments.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';

/**
 * Adapter en mémoire (ADR-005) : posts des comptes suivis et de l'appelant, filtrés par la politique
 * de visibilité (ADR-006), que `DrizzleFeedReader` traduit en SQL ; onglet Amis calculé à la lecture
 * (ADR-029) sur les posts, J'aime et commentaires en mémoire.
 */
export class InMemoryFeedReader implements FeedReader {
  constructor(
    private readonly posts: InMemoryPosts,
    private readonly relationships: InMemoryRelationshipReader,
    private readonly profiles?: InMemoryProfileRepository,
    private readonly comments?: InMemoryComments,
  ) {}

  private relation(viewerId: string, ownerId: string): Relationship {
    return {
      viewerFollowsOwner: this.relationships.isFollowing(viewerId, ownerId),
      ownerFollowsViewer: this.relationships.isFollowing(ownerId, viewerId),
      viewerRequestedOwner: this.relationships.hasRequested(viewerId, ownerId),
      blocked: this.relationships.isBlockedEitherWay(viewerId, ownerId),
      viewerIsCloseFriend: false,
    };
  }

  listReelsFeed({ viewerId, after, limit }: FeedQuery): Promise<Page<Post>> {
    return Promise.resolve(
      this.posts.list(
        viewerId,
        (post) =>
          post.kind === 'reel' &&
          post.author.id !== viewerId &&
          canViewContent(viewerId, post.author, this.relation(viewerId, post.author.id)),
        after,
        limit,
      ),
    );
  }

  listFeed({ viewerId, after, limit }: FeedQuery): Promise<Page<Post>> {
    return Promise.resolve(
      this.posts.list(
        viewerId,
        ({ author }) =>
          (author.id === viewerId || this.relationships.isFollowing(viewerId, author.id)) &&
          canViewContent(viewerId, author, this.relation(viewerId, author.id)),
        after,
        limit,
      ),
    );
  }

  async listFriendsReels({ viewerId, after, limit }: FeedQuery): Promise<Page<FriendsReelEntry>> {
    const rows = await this.listFriendInteractions(viewerId, [...this.posts.rows.keys()]);
    const activity = new Map<string, Date>();
    for (const row of rows) {
      const current = activity.get(row.postId);
      if (!current || row.at > current) activity.set(row.postId, row.at);
    }
    const entries: FriendsReelEntry[] = [];
    for (const [postId, activityAt] of activity) {
      const post = await this.findReel(postId, viewerId);
      if (
        post &&
        post.author.id !== viewerId &&
        canViewContent(viewerId, post.author, this.relation(viewerId, post.author.id))
      )
        entries.push({ post, activityAt });
    }
    const sorted = entries
      .filter((entry) => !after || compare(entry, after) < 0)
      .sort((a, b) => compare(b, { createdAt: a.activityAt, id: a.post.id }));
    const page = sorted.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      next: sorted.length > limit && last ? { createdAt: last.activityAt, id: last.post.id } : null,
    };
  }

  listFriendInteractions(
    viewerId: string,
    postIds: readonly string[],
  ): Promise<FriendInteractionRow[]> {
    const profiles = this.profiles;
    if (!profiles) throw new Error('InMemoryFeedReader sans profils : onglet Amis indisponible');
    const friendOf = (id: string) => {
      const profile = profiles.rows.get(id);
      if (!profile || id === viewerId || profile.status !== 'active') return null;
      const relation = this.relation(viewerId, id);
      if (relation.blocked || !isMutual(relation)) return null;
      return profile;
    };
    const wanted = new Set(postIds);
    const rows: FriendInteractionRow[] = [];
    const push = (
      postId: string,
      friendId: string,
      kind: FriendInteractionRow['kind'],
      at: Date,
      commentText?: string,
      needsActivity = true,
    ) => {
      const friend = friendOf(friendId);
      if (!friend || (needsActivity && friend.friendsTabActivity !== 'mutuals')) return;
      rows.push({
        postId,
        kind,
        at,
        ...(commentText !== undefined && { commentText }),
        friend: {
          id: friend.id,
          username: friend.username,
          avatarVariants: friend.avatar?.variants ?? null,
        },
      });
    };
    for (const post of this.posts.rows.values()) {
      if (wanted.has(post.id) && post.kind === 'reel' && !post.deletedAt)
        push(post.id, post.authorId, 'created', post.createdAt, undefined, false);
    }
    for (const [key, at] of this.posts.likes) {
      const [userId = '', postId = ''] = key.split(':');
      if (wanted.has(postId)) push(postId, userId, 'liked', at);
    }
    const latestComments = new Map<
      string,
      { postId: string; authorId: string; createdAt: Date; body: string }
    >();
    for (const row of this.comments?.rows.values() ?? []) {
      if (!wanted.has(row.postId) || row.deletedAt) continue;
      const key = `${row.postId}:${row.authorId}`;
      const current = latestComments.get(key);
      if (!current || row.createdAt >= current.createdAt) latestComments.set(key, row);
    }
    for (const row of latestComments.values())
      push(row.postId, row.authorId, 'commented', row.createdAt, row.body);
    return Promise.resolve(rows);
  }

  async findReel(postId: string, viewerId: string): Promise<Post | null> {
    const post = await this.posts.findById(postId, viewerId);
    return post?.kind === 'reel' ? post : null;
  }
}

function compare(
  a: { activityAt: Date; post: { id: string } },
  b: { createdAt: Date; id: string },
): number {
  const byDate = a.activityAt.getTime() - b.createdAt.getTime();
  return byDate !== 0 ? byDate : a.post.id.localeCompare(b.id);
}

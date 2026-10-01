import type {
  FeedQuery,
  FeedReader,
} from '../../src/modules/feed/application/ports/feed-reader.ts';
import type { Post } from '../../src/modules/posts/domain/post.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import { canViewContent } from '../../src/shared/domain/visibility.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';

/**
 * Adapter en mémoire (ADR-005) : posts des comptes suivis et de l'appelant, filtrés par la politique
 * de visibilité (ADR-006), que `DrizzleFeedReader` traduit en SQL.
 */
export class InMemoryFeedReader implements FeedReader {
  constructor(
    private readonly posts: InMemoryPosts,
    private readonly relationships: InMemoryRelationshipReader,
  ) {}

  listFeed({ viewerId, after, limit }: FeedQuery): Promise<Page<Post>> {
    return Promise.resolve(
      this.posts.list(
        ({ author }) =>
          (author.id === viewerId || this.relationships.isFollowing(viewerId, author.id)) &&
          canViewContent(viewerId, author, {
            viewerFollowsOwner: this.relationships.isFollowing(viewerId, author.id),
            ownerFollowsViewer: this.relationships.isFollowing(author.id, viewerId),
            blocked: this.relationships.isBlockedEitherWay(viewerId, author.id),
            viewerIsCloseFriend: false,
          }),
        after,
        limit,
      ),
    );
  }
}

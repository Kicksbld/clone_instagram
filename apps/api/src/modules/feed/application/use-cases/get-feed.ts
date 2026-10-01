import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Post } from '../../../posts/domain/post.ts';
import { FEED_PAGE_SIZE } from '../../domain/feed.ts';
import type { FeedReader } from '../ports/feed-reader.ts';

/**
 * Feed d'accueil de l'appelant, du plus récent au plus ancien. La visibilité est appliquée par la
 * requête (ADR-006) ; sans profil ni abonnement, le feed est vide.
 */
export class GetFeed {
  constructor(private readonly feed: FeedReader) {}

  async execute(input: { viewerId: string; after: PageCursor | null }): Promise<Page<Post>> {
    return this.feed.listFeed({
      viewerId: input.viewerId,
      after: input.after,
      limit: FEED_PAGE_SIZE,
    });
  }
}

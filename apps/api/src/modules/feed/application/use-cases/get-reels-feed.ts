import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Post } from '../../../posts/domain/post.ts';
import { REELS_PAGE_SIZE } from '../../domain/feed.ts';
import type { FeedReader } from '../ports/feed-reader.ts';

/**
 * Fil de reels de l'appelant, du plus récent au plus ancien. La visibilité est appliquée par la
 * requête (ADR-006) ; les comptes publics sont inclus sans abonnement.
 */
export class GetReelsFeed {
  constructor(private readonly feed: FeedReader) {}

  async execute(input: { viewerId: string; after: PageCursor | null }): Promise<Page<Post>> {
    return this.feed.listReelsFeed({
      viewerId: input.viewerId,
      after: input.after,
      limit: REELS_PAGE_SIZE,
    });
  }
}

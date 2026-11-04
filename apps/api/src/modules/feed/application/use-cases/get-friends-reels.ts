import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import {
  groupFriendInteractions,
  REELS_PAGE_SIZE,
  toFriendsReel,
  type FriendsReel,
} from '../../domain/feed.ts';
import type { FeedReader } from '../ports/feed-reader.ts';

/**
 * Onglet Amis des Reels de l'appelant (ADR-029), calculé à la lecture : la requête applique la
 * visibilité (ADR-006) et le réglage des amis ; chaque reel reçoit ses aperçus d'amis.
 */
export class GetFriendsReels {
  constructor(private readonly feed: FeedReader) {}

  async execute(input: { viewerId: string; after: PageCursor | null }): Promise<Page<FriendsReel>> {
    const page = await this.feed.listFriendsReels({
      viewerId: input.viewerId,
      after: input.after,
      limit: REELS_PAGE_SIZE,
    });
    const interactions = groupFriendInteractions(
      await this.feed.listFriendInteractions(
        input.viewerId,
        page.items.map(({ post }) => post.id),
      ),
    );
    return {
      items: page.items.map(({ post }) => toFriendsReel(post, interactions.get(post.id) ?? [])),
      next: page.next,
    };
  }
}

import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import { canViewContent, SELF_RELATIONSHIP } from '../../../../shared/domain/visibility.ts';
import { PostNotFoundError } from '../../../posts/domain/errors.ts';
import { groupFriendInteractions, type FriendInteraction } from '../../domain/feed.ts';
import type { FeedReader } from '../ports/feed-reader.ts';

/**
 * Liste complète des amis qui ont interagi avec un reel (ADR-029), pour la feuille de l'onglet Amis.
 * Reel inexistant, photo ou invisible pour l'appelant → 404, jamais 403 (ADR-006).
 */
export class ListReelFriendInteractions {
  constructor(
    private readonly feed: FeedReader,
    private readonly relationships: RelationshipReader,
  ) {}

  async execute(input: { viewerId: string; postId: string }): Promise<FriendInteraction[]> {
    const reel = await this.feed.findReel(input.postId, input.viewerId);
    if (!reel) throw new PostNotFoundError();
    const { author } = reel;
    const relation =
      author.id === input.viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(input.viewerId, author.id);
    if (!canViewContent(input.viewerId, author, relation)) throw new PostNotFoundError();
    const rows = await this.feed.listFriendInteractions(input.viewerId, [reel.id]);
    return groupFriendInteractions(rows).get(reel.id) ?? [];
  }
}

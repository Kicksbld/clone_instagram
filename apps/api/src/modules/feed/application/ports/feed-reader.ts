import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Post } from '../../../posts/domain/post.ts';
import type { FriendInteractionRow } from '../../domain/feed.ts';

export interface FeedQuery {
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

/** Reel de l'onglet Amis et date de l'interaction d'ami la plus récente (curseur, ADR-029). */
export interface FriendsReelEntry {
  post: Post;
  activityAt: Date;
}

/**
 * Feed d'accueil chronologique (ADR-007) : posts non supprimés des comptes suivis et de l'appelant.
 * La requête traduit `canViewContent` en SQL (ADR-006) : auteurs bloqués dans un sens ou dans
 * l'autre et comptes non actifs absents. Curseur `(created_at, id)`, plus récent d'abord.
 */
export interface FeedReader {
  listFeed(query: FeedQuery): Promise<Page<Post>>;
  /** Reels visibles des autres comptes publics ou suivis, chronologiques (ADR-029). */
  listReelsFeed(query: FeedQuery): Promise<Page<Post>>;
  /**
   * Onglet Amis (ADR-029) : reels visibles créés, aimés ou commentés par les abonnés mutuels actifs
   * et non bloqués (J'aime et commentaires seulement si l'ami a gardé `mutuals`), sans les reels de
   * l'appelant ; un reel une fois, à la date de l'interaction d'ami la plus récente. Curseur
   * `(activity_at, post_id)` : `next.createdAt` porte la date d'activité.
   */
  listFriendsReels(query: FeedQuery): Promise<Page<FriendsReelEntry>>;
  /** Interactions des amis de `viewerId` avec ces reels, mêmes règles d'amis et de réglage. */
  listFriendInteractions(
    viewerId: string,
    postIds: readonly string[],
  ): Promise<FriendInteractionRow[]>;
  /** Reel non supprimé (`kind` `reel`), vu par `viewerId` ; la visibilité reste au use case. */
  findReel(postId: string, viewerId: string): Promise<Post | null>;
}

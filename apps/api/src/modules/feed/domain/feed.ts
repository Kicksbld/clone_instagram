import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';
import type { Post } from '../../posts/domain/post.ts';

/** Feed d'accueil : 12 posts par page, comme Instagram. */
export const FEED_PAGE_SIZE = 12;

/** Onglet Reels (ADR-029). */
export const REELS_PAGE_SIZE = 10;

/** Aperçus d'amis affichés sur un reel de l'onglet Amis (ADR-029). */
export const FRIEND_INTERACTION_PREVIEWS = 3;

/** Ce qu'un ami (abonné mutuel) a fait d'un reel (ADR-029) ; `reposted` arrive en P2. */
export type FriendInteractionKind = 'created' | 'liked' | 'commented';

const KIND_ORDER: readonly FriendInteractionKind[] = ['created', 'liked', 'commented'];

export interface Friend {
  id: string;
  username: string;
  avatarVariants: ImageVariantPaths | null;
}

/** Une interaction brute, telle que la lit l'adapter : une ligne par ami, reel et type. */
export interface FriendInteractionRow {
  postId: string;
  friend: Friend;
  kind: FriendInteractionKind;
  at: Date;
  /** Texte du commentaire non supprimé le plus récent de l'ami (`commented` seulement). */
  commentText?: string;
}

/** Un ami et l'ensemble de ses interactions avec un reel. */
export interface FriendInteraction {
  friend: Friend;
  kinds: FriendInteractionKind[];
  commentText?: string;
  /** Date de son interaction la plus récente. */
  at: Date;
}

/** Reel de l'onglet Amis : aperçus des amis (3 au plus) et nombre total d'amis. */
export interface FriendsReel {
  post: Post;
  friendInteractions: FriendInteraction[];
  friendInteractionCount: number;
}

/**
 * Regroupe les interactions brutes par reel puis par ami : un ami une seule fois par reel, avec ses
 * types sans doublon et la date de sa dernière interaction ; amis du plus récent au plus ancien.
 */
export function groupFriendInteractions(
  rows: readonly FriendInteractionRow[],
): Map<string, FriendInteraction[]> {
  const byPost = new Map<string, Map<string, FriendInteraction>>();
  for (const row of rows) {
    const friends = byPost.get(row.postId) ?? new Map<string, FriendInteraction>();
    byPost.set(row.postId, friends);
    const current = friends.get(row.friend.id);
    const kinds = new Set([...(current?.kinds ?? []), row.kind]);
    const commentText = row.kind === 'commented' ? row.commentText : current?.commentText;
    friends.set(row.friend.id, {
      friend: row.friend,
      kinds: KIND_ORDER.filter((kind) => kinds.has(kind)),
      ...(commentText !== undefined && { commentText }),
      at: current && current.at > row.at ? current.at : row.at,
    });
  }
  const grouped = new Map<string, FriendInteraction[]>();
  for (const [postId, friends] of byPost) {
    grouped.set(
      postId,
      [...friends.values()].sort(
        (a, b) => b.at.getTime() - a.at.getTime() || b.friend.id.localeCompare(a.friend.id),
      ),
    );
  }
  return grouped;
}

/** Reel de l'onglet Amis avec ses 3 premiers aperçus et le nombre total d'amis. */
export function toFriendsReel(post: Post, interactions: readonly FriendInteraction[]): FriendsReel {
  return {
    post,
    friendInteractions: interactions.slice(0, FRIEND_INTERACTION_PREVIEWS),
    friendInteractionCount: interactions.length,
  };
}

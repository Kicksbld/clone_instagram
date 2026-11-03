import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { UserSummary } from '../../domain/user-summary.ts';

export interface ListQuery {
  /** Compte dont on lit les abonnés ou les abonnements. */
  ownerId: string;
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

export interface BlockedListQuery {
  /** Auteur des blocages. */
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

export interface FollowRequestListQuery {
  /** Destinataire des demandes. */
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

export interface CloseFriendListQuery {
  /** Propriétaire de la liste. */
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

export interface SearchQuery {
  viewerId: string;
  /** Texte normalisé (`normalizeSearchQuery`). */
  query: string;
  limit: number;
}

/**
 * Lectures de listes du module `social`. Chaque requête traduit en SQL la politique de visibilité
 * (ADR-006) : comptes bloqués dans un sens ou dans l'autre avec l'appelant et comptes non actifs
 * absents. Curseur : `(follows.created_at, id du profil)`, abonnement le plus récent en premier.
 */
export interface SocialGraphReader {
  listFollowers(query: ListQuery): Promise<Page<UserSummary>>;
  listFollowing(query: ListQuery): Promise<Page<UserSummary>>;
  /** Comptes actifs bloqués par l'appelant ; curseur `(blocks.created_at, id du profil)`. */
  listBlocked(query: BlockedListQuery): Promise<Page<UserSummary>>;
  /**
   * Comptes qui ont demandé à suivre l'appelant (actifs, sans blocage) ; curseur
   * `(follow_requests.created_at, id du profil)`, demande la plus récente en premier.
   */
  listFollowRequests(query: FollowRequestListQuery): Promise<Page<UserSummary>>;
  /**
   * Amis proches de l'appelant (actifs, sans blocage) ; curseur `(close_friends.created_at, id du
   * profil)`, ajout le plus récent en premier.
   */
  listCloseFriends(query: CloseFriendListQuery): Promise<Page<UserSummary>>;
  /** Tri : username exact, username qui commence par la requête, comptes suivis, similarité, abonnés. */
  search(query: SearchQuery): Promise<UserSummary[]>;
}

import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { UserSummary } from '../../domain/user-summary.ts';

export interface ListQuery {
  /** Compte dont on lit les abonnés ou les abonnements. */
  ownerId: string;
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
  /** Tri : username exact, username qui commence par la requête, comptes suivis, similarité, abonnés. */
  search(query: SearchQuery): Promise<UserSummary[]>;
}

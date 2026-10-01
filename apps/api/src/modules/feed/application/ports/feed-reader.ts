import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Post } from '../../../posts/domain/post.ts';

export interface FeedQuery {
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

/**
 * Feed d'accueil chronologique (ADR-007) : posts non supprimés des comptes suivis et de l'appelant.
 * La requête traduit `canViewContent` en SQL (ADR-006) : auteurs bloqués dans un sens ou dans
 * l'autre et comptes non actifs absents. Curseur `(created_at, id)`, plus récent d'abord.
 */
export interface FeedReader {
  listFeed(query: FeedQuery): Promise<Page<Post>>;
}

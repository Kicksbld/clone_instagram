import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Post, PostKind } from '../../domain/post.ts';

export interface NewPost {
  id: string;
  authorId: string;
  kind: PostKind;
  caption: string;
  /** Médias déjà rattachés (ADR-008), dans l'ordre d'affichage. */
  mediaIds: string[];
  createdAt: Date;
}

/** Écritures des posts (tables `posts`, `post_media`) et compteur `post_count` de l'auteur. */
export interface PostRepository {
  create(post: NewPost): Promise<void>;
  incrementPostCount(authorId: string): Promise<void>;
  /**
   * Suppression logique, seulement si le post est à `authorId` et pas encore supprimé (écriture
   * conditionnelle : une double suppression ne passe qu'une fois). Renvoie les médias du post, ou
   * `null` si aucune ligne n'est touchée.
   */
  softDelete(id: string, authorId: string): Promise<string[] | null>;
  decrementPostCount(authorId: string): Promise<void>;
}

export interface AuthorPostsQuery {
  authorId: string;
  after: PageCursor | null;
  limit: number;
}

/**
 * Lectures des posts non supprimés, avec auteur et médias. La visibilité est décidée par le use
 * case (ADR-006) : ces lectures ne filtrent que `deleted_at`.
 */
export interface PostReader {
  findById(id: string): Promise<Post | null>;
  /** Du plus récent au plus ancien ; curseur `(created_at, id)` (ADR-007). */
  listByAuthor(query: AuthorPostsQuery): Promise<Page<Post>>;
}

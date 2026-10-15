import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';
import type { Comment } from '../../domain/comment.ts';

export interface NewComment {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
}

/** Commentaire non supprimé d'un post non supprimé, tel que l'autorisation le lit. */
export interface CommentTarget {
  id: string;
  postId: string;
  parentId: string | null;
  author: VisibilitySubject;
  /** Auteur du post, que la politique de visibilité lit. */
  postAuthor: VisibilitySubject;
}

/** Écritures des commentaires (table `comments`) et compteurs `comment_count` / `reply_count`. */
export interface CommentRepository {
  create(comment: NewComment): Promise<void>;
  findTarget(id: string): Promise<CommentTarget | null>;
  /**
   * Suppression logique du commentaire et de ses réponses, seulement s'il n'est pas déjà supprimé
   * (écriture conditionnelle). Renvoie le nombre de lignes supprimées (0 : déjà supprimé).
   */
  softDeleteWithReplies(id: string): Promise<number>;
  /** Ajoute `delta` au `comment_count` du post (réponses comprises). */
  applyCommentCount(postId: string, delta: number): Promise<void>;
  /** Ajoute `delta` au `reply_count` du commentaire. */
  applyReplyCount(commentId: string, delta: 1 | -1): Promise<void>;
}

export interface CommentsQuery {
  viewerId: string;
  after: PageCursor | null;
  limit: number;
}

/**
 * Lectures des commentaires non supprimés, du plus récent au plus ancien (curseur `(created_at, id)`,
 * ADR-007). Les listes excluent les auteurs bloqués dans un sens ou dans l'autre et les comptes non
 * actifs (ADR-006, traduit en SQL) ; la visibilité du post est décidée par le use case.
 */
export interface CommentReader {
  findById(id: string): Promise<Comment | null>;
  listByPost(postId: string, query: CommentsQuery): Promise<Page<Comment>>;
  listReplies(parentId: string, query: CommentsQuery): Promise<Page<Comment>>;
}

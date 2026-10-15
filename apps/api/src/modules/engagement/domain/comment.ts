import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';
import type { VisibilitySubject } from '../../../shared/domain/visibility.ts';
import { InvalidCommentBodyError } from './errors.ts';

export const COMMENT_BODY_MAX_LENGTH = 2200;
/** Commentaires et réponses : 20 par page. */
export const COMMENTS_PAGE_SIZE = 20;

export interface CommentAuthor extends VisibilitySubject {
  username: string;
  avatarVariants: ImageVariantPaths | null;
}

/** Commentaire (ou réponse, `parentId` renseigné) non supprimé, avec son auteur. */
export interface Comment {
  id: string;
  postId: string;
  /** Auteur du post : il peut supprimer les commentaires de son post. */
  postAuthorId: string;
  parentId: string | null;
  author: CommentAuthor;
  body: string;
  replyCount: number;
  createdAt: Date;
}

/** Commentaire vu par un appelant. */
export interface CommentView extends Comment {
  viewerCanDelete: boolean;
}

/** L'auteur du commentaire, ou celui du post, peut le supprimer. */
export function canDeleteComment(
  viewerId: string,
  comment: { author: { id: string }; postAuthorId: string },
): boolean {
  return viewerId === comment.author.id || viewerId === comment.postAuthorId;
}

export function viewOf(comment: Comment, viewerId: string): CommentView {
  return { ...comment, viewerCanDelete: canDeleteComment(viewerId, comment) };
}

/**
 * Corps sans espaces en début ni en fin ; de 1 à 2 200 caractères, comptés en points de code comme
 * `char_length` de Postgres et `maxLength` du contrat.
 */
export function normalizeCommentBody(body: string): string {
  const trimmed = body.trim();
  const length = Array.from(trimmed).length;
  if (length === 0 || length > COMMENT_BODY_MAX_LENGTH) throw new InvalidCommentBodyError();
  return trimmed;
}

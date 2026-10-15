import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';

/** Commentaire non supprimé d'un post non supprimé : son auteur et celui du post. */
export interface ReportedComment {
  author: VisibilitySubject;
  postAuthor: VisibilitySubject;
}

/**
 * Lecture des cibles d'un signalement, telles que la politique de visibilité les lit (ADR-006) ;
 * `null` si la cible n'existe pas ou est supprimée.
 */
export interface ReportTargetReader {
  /** Auteur d'un post non supprimé. */
  findPostAuthor(postId: string): Promise<VisibilitySubject | null>;
  findComment(commentId: string): Promise<ReportedComment | null>;
  findUser(userId: string): Promise<VisibilitySubject | null>;
}

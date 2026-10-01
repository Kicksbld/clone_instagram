import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';

/** Post visé par un like : son auteur, que la politique de visibilité lit, et son compteur. */
export interface LikeablePost {
  id: string;
  likeCount: number;
  author: VisibilitySubject;
}

/** Lecture d'un post non supprimé (table `posts`) par le module `engagement`. */
export interface LikeablePostReader {
  findById(id: string): Promise<LikeablePost | null>;
}

/** Likes des posts (table `post_likes`) et compteur `posts.like_count` (ADR-007). */
export interface LikeRepository {
  /** Crée le like ; `false`, sans effet, s'il existait déjà. */
  add(userId: string, postId: string): Promise<boolean>;
  /** Supprime le like ; `false`, sans effet, s'il n'existait pas. */
  remove(userId: string, postId: string): Promise<boolean>;
  /** Ajoute `delta` au `like_count` du post ; renvoie le nouveau compteur. */
  applyLikeCount(postId: string, delta: 1 | -1): Promise<number>;
}

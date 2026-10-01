/** État du like de l'appelant après l'action, et nombre de likes du post (pas d'entité, ADR-005). */
export interface LikeStatus {
  liked: boolean;
  likeCount: number;
}

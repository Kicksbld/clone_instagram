/** Abonnements (table `follows`) ; écrit dans une transaction avec les compteurs (ADR-005). */
export interface FollowRepository {
  /** Crée l'abonnement ; `false`, sans effet, s'il existait déjà. */
  add(followerId: string, followeeId: string): Promise<boolean>;
  /** Supprime l'abonnement ; `false`, sans effet, s'il n'existait pas. */
  remove(followerId: string, followeeId: string): Promise<boolean>;
}

/** Compteurs dénormalisés `follower_count` / `following_count` des profils (ADR-007). */
export interface FollowCounters {
  /**
   * Ajoute `delta` au `following_count` de l'abonné et au `follower_count` du compte suivi ;
   * renvoie le nouveau `follower_count` du compte suivi.
   */
  apply(followerId: string, followeeId: string, delta: 1 | -1): Promise<number>;
}

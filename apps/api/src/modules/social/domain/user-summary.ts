import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';

/** Compte dans une liste d'abonnés ou un résultat de recherche, vu par l'appelant. */
export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  isPrivate: boolean;
  avatarVariants: ImageVariantPaths | null;
  /** Relation avec l'appelant ; toutes les valeurs sont `false` pour l'appelant lui-même. */
  relationship: { following: boolean; followedBy: boolean; requested: boolean };
}

/**
 * Résultat d'un follow ou d'un unfollow : relation (abonné, ou demande en attente vers un compte
 * privé), et compteur d'abonnés du compte visé.
 */
export interface FollowStatus {
  following: boolean;
  requested: boolean;
  followerCount: number;
}

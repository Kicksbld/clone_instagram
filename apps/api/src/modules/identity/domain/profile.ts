import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';
import type { AccountStatus } from '../../../shared/domain/visibility.ts';

export type { AccountStatus };

/** Photo de profil : média attaché et ses variantes (ADR-008). */
export interface Avatar {
  mediaId: string;
  variants: ImageVariantPaths;
}

/** Profil de l'utilisateur, tel que le module `identity` le manipule. */
export interface Profile {
  /** Identifiant Supabase Auth (ADR-004). */
  id: string;
  username: string;
  fullName: string;
  bio: string;
  /** Date au format `AAAA-MM-JJ`, renvoyée à son seul propriétaire (ADR-018). */
  birthDate: string;
  isPrivate: boolean;
  status: AccountStatus;
  followerCount: number;
  followingCount: number;
  postCount: number;
  avatar: Avatar | null;
  createdAt: Date;
}

/** Nom affiché sans espaces superflus en début et en fin (le contrat garantit 1 à 30 caractères). */
export function normalizeFullName(raw: string): string {
  return raw.trim();
}

/** Bio sans espaces superflus en début et en fin ; chaîne vide = pas de bio. */
export function normalizeBio(raw: string): string {
  return raw.trim();
}

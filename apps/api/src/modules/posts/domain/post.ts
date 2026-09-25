import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';
import type { VisibilitySubject } from '../../../shared/domain/visibility.ts';
import { CaptionTooLongError } from './errors.ts';

/** `reel` arrive en P1 (une seule table pour les deux, ADR-007). */
export type PostKind = 'post' | 'reel';

export const CAPTION_MAX_LENGTH = 2200;
/** Carrousel : 10 images au plus (`maxItems` du contrat, `position` 0 à 9 en base). */
export const POST_MEDIA_MAX = 10;
/** Grille du profil : 12 posts par page, comme Instagram. */
export const USER_POSTS_PAGE_SIZE = 12;

/** Auteur d'un post : ce que la politique de visibilité lit, et ce que la réponse affiche. */
export interface PostAuthor extends VisibilitySubject {
  username: string;
  avatarVariants: ImageVariantPaths | null;
}

/** Une image d'un post, dans l'ordre d'affichage. */
export interface PostMediaItem {
  variants: ImageVariantPaths;
  width: number;
  height: number;
}

/** Post non supprimé, avec son auteur et ses médias. */
export interface Post {
  id: string;
  kind: PostKind;
  caption: string;
  author: PostAuthor;
  media: PostMediaItem[];
  createdAt: Date;
}

/**
 * Légende sans espaces en début ni en fin ; 2 200 caractères au plus, comptés en points de code
 * comme `char_length` de Postgres et `maxLength` du contrat.
 */
export function normalizeCaption(caption: string): string {
  const trimmed = caption.trim();
  if (Array.from(trimmed).length > CAPTION_MAX_LENGTH) throw new CaptionTooLongError();
  return trimmed;
}

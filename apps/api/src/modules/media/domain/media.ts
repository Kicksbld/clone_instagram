import type { MediaVariantPaths } from '../../../shared/domain/image-variants.ts';

export type MediaKind = 'image' | 'video';
export type MediaPurpose = 'post' | 'story' | 'avatar' | 'message' | 'instant';
export type MediaStatus = 'pending_upload' | 'uploaded' | 'processing' | 'ready' | 'failed';
export type MediaFailureReason =
  'invalid_image' | 'file_too_large' | 'processing_error' | 'invalid_video' | 'video_too_long';

/** Média uploadé (ADR-008). Le statut ne change que par les transitions de `packages/db`. */
export interface Media {
  id: string;
  ownerId: string;
  kind: MediaKind;
  purpose: MediaPurpose;
  status: MediaStatus;
  /** Chemin de l'original dans le bucket `uploads`. */
  originalPath: string;
  mimeType: string;
  sizeBytes: number;
  variants: MediaVariantPaths | null;
  durationMs?: number | null;
  failureReason: MediaFailureReason | null;
  attachedAt: Date | null;
}

/** Chemin de l'original : non devinable (UUID), rangé par propriétaire. */
export function originalPathFor(ownerId: string, mediaId: string): string {
  return `${ownerId}/${mediaId}`;
}

/**
 * Variantes dans `media-public` (ADR-008) : jamais pour une photo de message ni un instant, lus
 * par URL signée (ADR-023). Aucune URL publique ne doit en être construite.
 */
export function hasPublicVariants(media: Pick<Media, 'purpose'>): boolean {
  return media.purpose !== 'message' && media.purpose !== 'instant';
}

/** Un média n'existe que pour son propriétaire : celui d'un autre est introuvable (404). */
export function isOwnedBy(media: Media | null, userId: string): media is Media {
  return media !== null && media.ownerId === userId;
}

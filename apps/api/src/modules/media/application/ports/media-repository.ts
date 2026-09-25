import type { Media, MediaKind, MediaPurpose } from '../../domain/media.ts';

export interface NewMedia {
  id: string;
  ownerId: string;
  kind: MediaKind;
  purpose: MediaPurpose;
  originalPath: string;
  mimeType: string;
  sizeBytes: number;
}

/** Accès aux médias ; les écritures sont les `UPDATE` conditionnels de `packages/db` (ADR-008). */
export interface MediaRepository {
  /** `null` si le propriétaire n'a pas de profil. */
  create(media: NewMedia): Promise<Media | null>;
  findById(id: string): Promise<Media | null>;
  /** `pending_upload → uploaded` ; `false` si le statut n'était pas `pending_upload`. */
  markUploaded(id: string): Promise<boolean>;
  /** `false` si le média n'est pas à ce propriétaire, pas `ready`, d'un autre usage ou déjà utilisé. */
  attach(target: { id: string; ownerId: string; purpose: MediaPurpose }): Promise<boolean>;
  /** Le média n'est plus utilisé : la purge l'efface. */
  detach(id: string): Promise<void>;
}

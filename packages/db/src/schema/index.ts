// Schéma Drizzle, référence du modèle de données (ADR-007).
// Chaque tranche y ajoute ses tables ; toute table créée active RLS sans policy (ADR-004).
export { profiles, type NewProfileRow, type ProfileRow } from './profiles.ts';
export {
  media,
  MEDIA_FAILURE_REASONS,
  MEDIA_KINDS,
  MEDIA_PURPOSES,
  MEDIA_STATUSES,
  type ImageVariantPaths,
  type MediaFailureReason,
  type MediaKind,
  type MediaPurpose,
  type MediaRow,
  type MediaStatus,
  type NewMediaRow,
  STORAGE_BUCKETS,
} from './media.ts';

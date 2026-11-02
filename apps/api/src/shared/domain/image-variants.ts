/**
 * Chemins Storage des variantes WebP d'une image (ADR-008) : `thumb` 150 px, `medium` 640 px,
 * `large` 1080 px. Jamais des URL : l'infrastructure HTTP construit les URL publiques.
 */
export interface ImageVariantPaths {
  thumb: string;
  medium: string;
  large: string;
}

export interface VideoVariantPaths {
  hls: string;
  thumbnail: string;
}
export type MediaVariantPaths = ImageVariantPaths | VideoVariantPaths;

/** Static preview used by activity and moderation before their video viewers arrive. */
export function previewVariants(
  paths: MediaVariantPaths | null | undefined,
): ImageVariantPaths | null {
  if (!paths) return null;
  return 'hls' in paths
    ? { thumb: paths.thumbnail, medium: paths.thumbnail, large: paths.thumbnail }
    : paths;
}

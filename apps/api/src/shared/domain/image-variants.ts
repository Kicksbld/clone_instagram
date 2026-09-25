/**
 * Chemins Storage des variantes WebP d'une image (ADR-008) : `thumb` 150 px, `medium` 640 px,
 * `large` 1080 px. Jamais des URL : l'infrastructure HTTP construit les URL publiques.
 */
export interface ImageVariantPaths {
  thumb: string;
  medium: string;
  large: string;
}

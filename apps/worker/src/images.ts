import sharp from 'sharp';

/** Entrée acceptée (ADR-008) : JPEG ou PNG de 20 Mo au plus, type détecté sur le fichier réel. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png']);

/** Largeurs des variantes WebP (ADR-008). */
export const VARIANT_WIDTHS = { thumb: 150, medium: 640, large: 1080 } as const;
export type VariantName = keyof typeof VARIANT_WIDTHS;

export type ImageCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: 'invalid_image' | 'file_too_large' };

/** Revalide le fichier réel : les déclarations du client ne font pas foi. */
export async function checkImage(file: Buffer): Promise<ImageCheck> {
  if (file.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: 'file_too_large' };
  try {
    const metadata = await sharp(file).metadata();
    if (!ACCEPTED_FORMATS.has(metadata.format)) return { ok: false, reason: 'invalid_image' };
    // Dimensions affichées : l'orientation EXIF 5 à 8 échange largeur et hauteur.
    const rotated = (metadata.orientation ?? 1) >= 5;
    return {
      ok: true,
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
    };
  } catch {
    // sharp ne sait pas lire le fichier : ce n'est pas une image.
    return { ok: false, reason: 'invalid_image' };
  }
}

/**
 * Variantes WebP : orientation appliquée, jamais agrandies. sharp n'écrit aucune métadonnée
 * sans `withMetadata()` : EXIF (dont GPS), ICC et XMP sont supprimés.
 */
export async function renderVariants(file: Buffer): Promise<Record<VariantName, Buffer>> {
  const render = (width: number) =>
    sharp(file)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  const [thumb, medium, large] = await Promise.all([
    render(VARIANT_WIDTHS.thumb),
    render(VARIANT_WIDTHS.medium),
    render(VARIANT_WIDTHS.large),
  ]);
  return { thumb, medium, large };
}

import { BadRequestError } from './errors.ts';

/** Ordre identique aux médias ; l’absence conserve les anciens contenus et clients. */
export function normalizeMediaAltTexts(
  texts: string[] | undefined,
  count: number,
): string[] | undefined {
  if (texts === undefined) return undefined;
  if (texts.length !== count) {
    throw new BadRequestError(
      'invalid_media_descriptions',
      'Une description est attendue par média.',
    );
  }
  return texts.map(normalizeAltText);
}

export function normalizeAltText(text: string): string {
  const normalized = text.trim();
  if (Array.from(normalized).length > 1000) {
    throw new BadRequestError(
      'invalid_media_descriptions',
      'La description dépasse 1 000 caractères.',
    );
  }
  return normalized;
}

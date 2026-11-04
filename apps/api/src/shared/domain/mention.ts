import type { ImageVariantPaths } from './image-variants.ts';
import { BusinessRuleError } from './errors.ts';

export interface Mention {
  id: string;
  username: string;
  textUsername?: string;
  avatarVariants: ImageVariantPaths | null;
}

/** Distinct usernames, in text order. An email address is not a mention. */
export function mentionedUsernames(text: string): string[] {
  const names = [
    ...new Set(
      [...text.matchAll(/(?<![\p{L}\p{N}_.@])@([a-zA-Z0-9_.]{1,30})(?![a-zA-Z0-9_.])/gu)].map(
        (match) => (match[1] ?? '').toLowerCase(),
      ),
    ),
  ];
  if (names.length > 20)
    throw new BusinessRuleError(
      'too_many_mentions',
      'Vous pouvez mentionner au maximum 20 comptes.',
    );
  return names;
}

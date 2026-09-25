import { describe, expect, it } from 'vitest';

import { CaptionTooLongError } from '../../../src/modules/posts/domain/errors.ts';
import { normalizeCaption } from '../../../src/modules/posts/domain/post.ts';

describe('normalizeCaption', () => {
  it('retire les espaces en début et en fin, garde les retours à la ligne internes', () => {
    expect(normalizeCaption('  Salut\n\nà tous  ')).toBe('Salut\n\nà tous');
  });

  it('accepte 2 200 caractères, emojis comptés comme un caractère', () => {
    expect(normalizeCaption('😀'.repeat(2200))).toHaveLength(4400);
  });

  it('refuse 2 201 caractères', () => {
    expect(() => normalizeCaption('a'.repeat(2201))).toThrow(CaptionTooLongError);
  });
});

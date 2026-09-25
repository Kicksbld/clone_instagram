import { describe, expect, it } from 'vitest';

import { normalizeSearchQuery } from '../../../src/modules/social/domain/search-query.ts';

describe('normalizeSearchQuery', () => {
  it.each([
    ['lea', 'lea'],
    ['  Léa  ', 'léa'],
    ['@lea.martin', 'lea.martin'],
    ['@@ Lea', 'lea'],
    ['a'.repeat(30), 'a'.repeat(30)],
  ])('« %s » → « %s »', (raw, expected) => {
    expect(normalizeSearchQuery(raw)).toBe(expected);
  });

  it.each([['   '], ['@'], [' @ '], ['a'.repeat(31)]])('« %s » → rien à chercher', (raw) => {
    expect(normalizeSearchQuery(raw)).toBeNull();
  });
});

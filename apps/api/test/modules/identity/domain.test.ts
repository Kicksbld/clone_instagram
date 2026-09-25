import { describe, expect, it } from 'vitest';

import { ageOn, isOldEnough } from '../../../src/modules/identity/domain/age.ts';
import { normalizeBio, normalizeFullName } from '../../../src/modules/identity/domain/profile.ts';
import {
  isValidUsername,
  usernameSuggestionCandidates,
} from '../../../src/modules/identity/domain/username.ts';

describe('username', () => {
  it.each(['a', 'killian', 'killian.b', 'k_b.2026', 'a'.repeat(30)])('%s est valide', (value) => {
    expect(isValidUsername(value)).toBe(true);
  });

  it.each(['', 'Killian', 'killian b', 'killian-b', 'kïllian', 'a'.repeat(31)])(
    '« %s » est invalide',
    (value) => {
      expect(isValidUsername(value)).toBe(false);
    },
  );

  it('propose des candidats valides, distincts du username pris', () => {
    const candidates = usernameSuggestionCandidates('killian');

    expect(candidates.slice(0, 3)).toEqual(['killian_', 'killian.', 'killian1']);
    expect(candidates).not.toContain('killian');
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.every(isValidUsername)).toBe(true);
  });

  it('tronque un username de 30 caractères pour que le suffixe tienne', () => {
    const taken = 'a'.repeat(30);
    const candidates = usernameSuggestionCandidates(taken);

    expect(candidates[0]).toBe(`${'a'.repeat(29)}_`);
    expect(candidates.every((c) => c.length <= 30 && c !== taken)).toBe(true);
  });
});

describe('âge', () => {
  const today = new Date('2026-09-25T12:00:00.000Z');

  it.each([
    ['2013-09-25', 13],
    ['2013-09-26', 12],
    ['2013-08-31', 13],
    ['2013-10-01', 12],
    ['2000-01-01', 26],
  ])('né le %s → %i ans', (birthDate, age) => {
    expect(ageOn(birthDate, today)).toBe(age);
  });

  it('13 ans le jour de l’anniversaire, pas la veille', () => {
    expect(isOldEnough('2013-09-25', today)).toBe(true);
    expect(isOldEnough('2013-09-26', today)).toBe(false);
  });

  it('date dans le futur → trop jeune', () => {
    expect(isOldEnough('2030-01-01', today)).toBe(false);
  });

  it('né un 29 février : 13 ans le 1er mars d’une année non bissextile', () => {
    expect(isOldEnough('2012-02-29', new Date('2025-02-28T12:00:00Z'))).toBe(false);
    expect(isOldEnough('2012-02-29', new Date('2025-03-01T12:00:00Z'))).toBe(true);
  });
});

describe('champs du profil', () => {
  it('retire les espaces en début et en fin du nom et de la bio', () => {
    expect(normalizeFullName('  Killian B  ')).toBe('Killian B');
    expect(normalizeBio('  Dev iOS\n')).toBe('Dev iOS');
  });
});

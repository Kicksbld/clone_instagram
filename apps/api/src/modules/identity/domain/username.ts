/** Username : 1 à 30 caractères `[a-z0-9._]`, en minuscules (ADR-007). */
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;

/** Nombre maximal de suggestions renvoyées quand un username est pris (ADR-018). */
export const MAX_USERNAME_SUGGESTIONS = 3;

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

const SUFFIXES = [
  '_',
  '.',
  ...Array.from({ length: 20 }, (_, i) => String(i + 1)),
  ...Array.from({ length: 10 }, (_, i) => `_${i + 1}`),
];

/**
 * Candidats dérivés d'un username pris, dans l'ordre de préférence. Le candidat est tronqué pour que
 * le suffixe tienne dans les 30 caractères. Le use case ne garde que les candidats libres.
 */
export function usernameSuggestionCandidates(taken: string): string[] {
  const candidates = SUFFIXES.map(
    (suffix) => taken.slice(0, USERNAME_MAX_LENGTH - suffix.length) + suffix,
  );
  return [...new Set(candidates)].filter((c) => c !== taken && isValidUsername(c));
}

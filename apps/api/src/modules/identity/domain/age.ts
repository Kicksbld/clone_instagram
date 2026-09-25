/** Âge minimum pour créer un compte, comme Instagram (ADR-018). */
export const MINIMUM_AGE = 13;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Âge en années révolues à la date `today` (UTC) d'une personne née le `birthDate` (`AAAA-MM-JJ`). */
export function ageOn(birthDate: string, today: Date): number {
  const match = DATE_PATTERN.exec(birthDate);
  if (!match) throw new Error(`Date de naissance mal formée : ${birthDate}`);
  const [, year, month, day] = match.map(Number) as [number, number, number, number];

  const currentMonth = today.getUTCMonth() + 1;
  const birthdayPassed =
    currentMonth > month || (currentMonth === month && today.getUTCDate() >= day);
  return today.getUTCFullYear() - year - (birthdayPassed ? 0 : 1);
}

export function isOldEnough(birthDate: string, today: Date): boolean {
  return ageOn(birthDate, today) >= MINIMUM_AGE;
}

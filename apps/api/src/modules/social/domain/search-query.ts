/** Longueur maximale d'un username et d'un nom (ADR-007) : au-delà, aucun compte ne correspond. */
const MAX_QUERY_LENGTH = 30;

/**
 * Texte recherché, nettoyé comme sur Instagram : espaces en début et en fin, `@` initial, minuscules
 * (les usernames sont en minuscules, le nom est comparé sans tenir compte de la casse). `null` si
 * rien ne peut correspondre.
 */
export function normalizeSearchQuery(raw: string): string | null {
  const query = raw.trim().replace(/^@+/, '').trim().toLowerCase();
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) return null;
  return query;
}

/** Horloge injectée, remplaçable dans les tests (ADR-005). */
export interface Clock {
  now(): Date;
}

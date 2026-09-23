import { v7 } from 'uuid';

/** Identifiant UUID v7, généré par l'application et trié dans le temps (ADR-007). */
export function newId(): string {
  return v7();
}

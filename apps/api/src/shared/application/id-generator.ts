/** Génère les identifiants des nouvelles lignes (UUID v7, ADR-007). */
export interface IdGenerator {
  next(): string;
}

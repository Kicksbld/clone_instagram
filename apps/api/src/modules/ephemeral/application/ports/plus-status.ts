/** Règle `isPlus` du module `billing` (ADR-012), relue pour chaque avantage demandé. */
export interface PlusStatus {
  isPlus(userId: string): Promise<boolean>;
}

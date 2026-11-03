/** Règle `isPlus` du module `billing` (ADR-012), lue au moment de la publication. */
export interface PlusStatus {
  isPlus(userId: string): Promise<boolean>;
}

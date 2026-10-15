/** Blocages (table `blocks`) ; écrits dans une transaction avec les abonnements (ADR-006). */
export interface BlockRepository {
  /** `blockerId` bloque `blockedId` (dans ce sens seulement). */
  has(blockerId: string, blockedId: string): Promise<boolean>;
  /** Crée le blocage ; `false`, sans effet, s'il existait déjà. */
  add(blockerId: string, blockedId: string): Promise<boolean>;
  /** Supprime le blocage ; `false`, sans effet, s'il n'existait pas. */
  remove(blockerId: string, blockedId: string): Promise<boolean>;
}

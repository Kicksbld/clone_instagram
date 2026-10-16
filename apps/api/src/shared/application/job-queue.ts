/**
 * File de jobs du worker (ADR-008, ADR-015) : une méthode par intention, sans type BullMQ.
 * Seul l'adapter (`shared/infrastructure/jobs`) connaît `packages/jobs`.
 */
export interface JobQueue {
  /** Traitement d'une image uploadée ; sans effet si ce média est déjà en file. */
  enqueueImageProcessing(mediaId: string): Promise<void>;
  /** Purge d'un compte supprimé (T13) ; sans effet si cette purge est déjà en file. */
  enqueueAccountPurge(profileId: string): Promise<void>;
}

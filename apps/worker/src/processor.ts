import { UnrecoverableError, type Job } from 'bullmq';

export type JobHandler = (job: Job) => Promise<unknown>;

/**
 * Aiguillage des jobs par nom. Chaque tranche qui crée un job y ajoute son handler, qui valide
 * d'abord le payload avec le schéma Zod de packages/jobs (ADR-015).
 */
export function createProcessor(handlers: ReadonlyMap<string, JobHandler>) {
  return async (job: Job): Promise<unknown> => {
    const handler = handlers.get(job.name);
    // Un job inconnu ne réussira jamais : échec définitif, sans nouvelle tentative.
    if (!handler) throw new UnrecoverableError(`Job inconnu : ${job.name}`);
    return await handler(job);
  };
}

/**
 * Transaction (ADR-005) : `run` exécute `work` avec des repositories liés à une même transaction,
 * validée si `work` réussit, annulée s'il lève une erreur. `Scope` = repositories du use case.
 */
export interface UnitOfWork<Scope> {
  run<T>(work: (scope: Scope) => Promise<T>): Promise<T>;
}

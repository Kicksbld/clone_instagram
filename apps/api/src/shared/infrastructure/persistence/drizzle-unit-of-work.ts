import type { Database, Executor } from '@clone/db';

import type { UnitOfWork } from '../../application/unit-of-work.ts';

/** `UnitOfWork` sur une transaction Postgres : `scope` construit les repositories liés à `tx`. */
export class DrizzleUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(
    private readonly db: Database,
    private readonly scope: (tx: Executor) => Scope,
  ) {}

  run<T>(work: (scope: Scope) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(this.scope(tx)));
  }
}

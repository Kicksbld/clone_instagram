import { profiles, type Executor } from '@clone/db';
import { eq } from 'drizzle-orm';

import type { AccountStatusReader } from '../../application/account-status-reader.ts';
import type { AccountStatus } from '../../domain/visibility.ts';

/** Statut lu sur la clé primaire de `profiles`. */
export class DrizzleAccountStatusReader implements AccountStatusReader {
  constructor(private readonly db: Executor) {}

  async statusOf(userId: string): Promise<AccountStatus | null> {
    const [row] = await this.db
      .select({ status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row?.status ?? null;
  }
}

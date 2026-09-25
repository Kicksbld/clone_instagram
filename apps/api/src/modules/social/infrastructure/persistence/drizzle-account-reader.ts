import { profiles, type Executor } from '@clone/db';
import { eq } from 'drizzle-orm';

import type { Account, AccountReader } from '../../application/ports/account-reader.ts';

/** Lecture des comptes dans `profiles`, sur une connexion ou dans une transaction. */
export class DrizzleAccountReader implements AccountReader {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Account | null> {
    const [row] = await this.db
      .select({
        id: profiles.id,
        status: profiles.status,
        isPrivate: profiles.isPrivate,
        followerCount: profiles.followerCount,
      })
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    return row ?? null;
  }
}

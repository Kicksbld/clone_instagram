import { closeFriends, type Executor } from '@clone/db';
import { and, eq } from 'drizzle-orm';

import type { CloseFriendRepository } from '../../application/ports/close-friend-repository.ts';

/** Amis proches : `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, sans effet si rien ne change. */
export class DrizzleCloseFriendRepository implements CloseFriendRepository {
  constructor(private readonly db: Executor) {}

  async add(ownerId: string, friendId: string): Promise<boolean> {
    const rows = await this.db
      .insert(closeFriends)
      .values({ ownerId, friendId })
      .onConflictDoNothing()
      .returning({ ownerId: closeFriends.ownerId });
    return rows.length > 0;
  }

  async remove(ownerId: string, friendId: string): Promise<boolean> {
    const rows = await this.db
      .delete(closeFriends)
      .where(and(eq(closeFriends.ownerId, ownerId), eq(closeFriends.friendId, friendId)))
      .returning({ ownerId: closeFriends.ownerId });
    return rows.length > 0;
  }
}

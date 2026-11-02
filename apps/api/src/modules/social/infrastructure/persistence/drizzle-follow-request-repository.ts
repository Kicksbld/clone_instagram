import { followRequests, type Executor } from '@clone/db';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { FollowRequestRepository } from '../../application/ports/follow-request-repository.ts';

/** Demandes d'abonnement : `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, sans effet si rien ne change. */
export class DrizzleFollowRequestRepository implements FollowRequestRepository {
  constructor(private readonly db: Executor) {}

  async add(requesterId: string, targetId: string): Promise<boolean> {
    const rows = await this.db
      .insert(followRequests)
      .values({ requesterId, targetId })
      .onConflictDoNothing()
      .returning({ requesterId: followRequests.requesterId });
    return rows.length > 0;
  }

  async remove(requesterId: string, targetId: string): Promise<boolean> {
    const rows = await this.db
      .delete(followRequests)
      .where(
        and(eq(followRequests.requesterId, requesterId), eq(followRequests.targetId, targetId)),
      )
      .returning({ requesterId: followRequests.requesterId });
    return rows.length > 0;
  }

  async removeAllTo(targetId: string): Promise<string[]> {
    // Lignes verrouillées puis supprimées : l'ordre des demandes est gardé pour l'acceptation.
    const pending = await this.db
      .select({ requesterId: followRequests.requesterId })
      .from(followRequests)
      .where(eq(followRequests.targetId, targetId))
      .orderBy(asc(followRequests.createdAt), asc(followRequests.requesterId))
      .for('update');
    const requesterIds = pending.map((row) => row.requesterId);
    if (requesterIds.length === 0) return [];
    await this.db
      .delete(followRequests)
      .where(
        and(
          eq(followRequests.targetId, targetId),
          inArray(followRequests.requesterId, requesterIds),
        ),
      );
    return requesterIds;
  }
}

import { follows, profiles, type Executor } from '@clone/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type {
  FollowCounters,
  FollowRepository,
} from '../../application/ports/follow-repository.ts';

/** Abonnements : `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, sans effet si rien ne change. */
export class DrizzleFollowRepository implements FollowRepository {
  constructor(private readonly db: Executor) {}

  async add(followerId: string, followeeId: string): Promise<boolean> {
    const rows = await this.db
      .insert(follows)
      .values({ followerId, followeeId })
      .onConflictDoNothing()
      .returning({ followerId: follows.followerId });
    return rows.length > 0;
  }

  async remove(followerId: string, followeeId: string): Promise<boolean> {
    const rows = await this.db
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
      .returning({ followerId: follows.followerId });
    return rows.length > 0;
  }
}

/**
 * Compteurs mis à jour en une seule requête sur les deux profils : deux follows croisés simultanés
 * verrouillent les lignes dans le même ordre (pas d'interblocage entre deux `UPDATE` successifs).
 */
export class DrizzleFollowCounters implements FollowCounters {
  constructor(private readonly db: Executor) {}

  async apply(followerId: string, followeeId: string, delta: 1 | -1): Promise<number> {
    const rows = await this.db
      .update(profiles)
      .set({
        followingCount: sql`${profiles.followingCount} + CASE WHEN ${profiles.id} = ${followerId} THEN ${delta}::int ELSE 0 END`,
        followerCount: sql`${profiles.followerCount} + CASE WHEN ${profiles.id} = ${followeeId} THEN ${delta}::int ELSE 0 END`,
        updatedAt: sql`now()`,
      })
      .where(inArray(profiles.id, [followerId, followeeId]))
      .returning({ id: profiles.id, followerCount: profiles.followerCount });
    const followee = rows.find((row) => row.id === followeeId);
    if (!followee) throw new Error('Compte suivi absent lors de la mise à jour des compteurs');
    return followee.followerCount;
  }
}

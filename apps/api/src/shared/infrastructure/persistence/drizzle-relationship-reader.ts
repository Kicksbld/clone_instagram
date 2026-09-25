import { blocks, follows, type Executor } from '@clone/db';
import { and, eq, or, sql } from 'drizzle-orm';

import type { RelationshipReader } from '../../application/relationship-reader.ts';
import type { Relationship } from '../../domain/visibility.ts';

/** Relation lue en une requête sur `follows` et `blocks` (index de clé primaire et `(blocked_id)`). */
export class DrizzleRelationshipReader implements RelationshipReader {
  constructor(private readonly db: Executor) {}

  async between(viewerId: string, ownerId: string): Promise<Relationship> {
    const follow = (followerId: string, followeeId: string) =>
      sql<boolean>`EXISTS (${this.db
        .select({ one: sql`1` })
        .from(follows)
        .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))})`;
    const blocked = sql<boolean>`EXISTS (${this.db
      .select({ one: sql`1` })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, ownerId)),
          and(eq(blocks.blockerId, ownerId), eq(blocks.blockedId, viewerId)),
        ),
      )})`;

    const [row] = await this.db
      .select({
        viewerFollowsOwner: follow(viewerId, ownerId).mapWith(Boolean),
        ownerFollowsViewer: follow(ownerId, viewerId).mapWith(Boolean),
        blocked: blocked.mapWith(Boolean),
      })
      .from(sql`(SELECT 1) AS relation`);
    if (!row) throw new Error('SELECT sans ligne renvoyée');
    // Amis proches : table `close_friends` en P1.
    return { ...row, viewerIsCloseFriend: false };
  }
}

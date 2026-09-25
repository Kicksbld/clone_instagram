import { blocks, follows, media, profiles, type Executor } from '@clone/db';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import type {
  ListQuery,
  SearchQuery,
  SocialGraphReader,
} from '../../application/ports/social-graph-reader.ts';
import type { Page } from '../../../../shared/domain/pagination.ts';
import type { UserSummary } from '../../domain/user-summary.ts';

/** Échappe `%`, `_` et `\` pour un motif `LIKE` (le `_` est autorisé dans un username). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Listes et recherche en une requête chacune. La politique de visibilité (ADR-006) y est traduite en
 * SQL : compte actif, aucun blocage dans un sens ou dans l'autre avec l'appelant.
 */
export class DrizzleSocialGraphReader implements SocialGraphReader {
  constructor(private readonly db: Executor) {}

  listFollowers(query: ListQuery): Promise<Page<UserSummary>> {
    // Abonnés : profils des `follower_id` qui suivent `ownerId`.
    return this.list(query, follows.followerId, eq(follows.followeeId, query.ownerId));
  }

  listFollowing(query: ListQuery): Promise<Page<UserSummary>> {
    // Abonnements : profils des `followee_id` suivis par `ownerId`.
    return this.list(query, follows.followeeId, eq(follows.followerId, query.ownerId));
  }

  async search({ viewerId, query, limit }: SearchQuery): Promise<UserSummary[]> {
    const contains = `%${escapeLike(query)}%`;
    const prefix = `${escapeLike(query)}%`;
    const following = this.follows(viewerId, profiles.id);
    const rows = await this.db
      .select(this.summaryFields(viewerId))
      .from(profiles)
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(
        and(
          this.visibleTo(viewerId),
          sql`(${profiles.username} ILIKE ${contains} OR ${profiles.fullName} ILIKE ${contains})`,
        ),
      )
      .orderBy(
        desc(sql`${profiles.username} = ${query}`),
        desc(sql`${profiles.username} LIKE ${prefix}`),
        desc(following),
        desc(
          sql`greatest(similarity(${profiles.username}, ${query}), similarity(${profiles.fullName}, ${query}))`,
        ),
        desc(profiles.followerCount),
        profiles.id,
      )
      .limit(limit);
    return rows.map(toSummary);
  }

  private async list(
    { viewerId, after, limit }: ListQuery,
    listed: typeof follows.followerId | typeof follows.followeeId,
    ofOwner: SQL,
  ): Promise<Page<UserSummary>> {
    const rows = await this.db
      // Date de l'abonnement listé : premier membre du curseur.
      .select({ ...this.summaryFields(viewerId), followedAt: follows.createdAt })
      .from(follows)
      .innerJoin(profiles, eq(profiles.id, listed))
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(
        and(
          ofOwner,
          this.visibleTo(viewerId),
          after
            ? sql`(${follows.createdAt}, ${profiles.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(follows.createdAt), desc(profiles.id))
      // Une ligne de plus pour savoir s'il existe une page suivante.
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      next: rows.length > limit && last ? { createdAt: last.followedAt, id: last.id } : null,
    };
  }

  private summaryFields(viewerId: string) {
    return {
      id: profiles.id,
      username: profiles.username,
      fullName: profiles.fullName,
      isPrivate: profiles.isPrivate,
      avatarVariants: media.variants,
      following: this.follows(viewerId, profiles.id).mapWith(Boolean),
      followedBy: this.follows(profiles.id, viewerId).mapWith(Boolean),
    };
  }

  private follows(
    followerId: string | typeof profiles.id,
    followeeId: string | typeof profiles.id,
  ) {
    return sql<boolean>`EXISTS (SELECT 1 FROM ${follows} AS f WHERE f.follower_id = ${followerId} AND f.followee_id = ${followeeId})`;
  }

  /** Compte actif, aucun blocage dans un sens ou dans l'autre avec l'appelant (ADR-006). */
  private visibleTo(viewerId: string): SQL {
    return sql`${profiles.status} = 'active' AND NOT EXISTS (
      SELECT 1 FROM ${blocks} AS b
      WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${profiles.id})
         OR (b.blocker_id = ${profiles.id} AND b.blocked_id = ${viewerId})
    )`;
  }
}

function toSummary(row: {
  id: string;
  username: string;
  fullName: string;
  isPrivate: boolean;
  avatarVariants: UserSummary['avatarVariants'];
  following: boolean;
  followedBy: boolean;
}): UserSummary {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    isPrivate: row.isPrivate,
    avatarVariants: row.avatarVariants,
    relationship: { following: row.following, followedBy: row.followedBy },
  };
}

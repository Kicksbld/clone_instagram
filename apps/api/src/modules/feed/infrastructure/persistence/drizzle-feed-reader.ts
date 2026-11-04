import {
  blocks,
  comments,
  follows,
  media,
  postLikes,
  posts,
  profiles,
  type Executor,
  type MediaVariantPaths,
} from '@clone/db';
import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';

import type { Page } from '../../../../shared/domain/pagination.ts';
import type { Post } from '../../../posts/domain/post.ts';
import {
  pageOf,
  postsBefore,
  selectPosts,
} from '../../../posts/infrastructure/persistence/drizzle-post-repository.ts';
import type {
  FeedQuery,
  FeedReader,
  FriendsReelEntry,
} from '../../application/ports/feed-reader.ts';
import type { FriendInteractionKind, FriendInteractionRow } from '../../domain/feed.ts';

/**
 * Amis de `viewerId` (ADR-029) : abonnés mutuels actifs, sans blocage dans un sens ou dans l'autre
 * (`isMutual`, `canViewProfile`, ADR-006), avec leur réglage `friends_tab_activity`.
 */
function friendsOf(viewerId: string): SQL {
  return sql`SELECT f.followee_id AS id, pr.friends_tab_activity AS activity
    FROM ${follows} AS f
    JOIN ${follows} AS back ON back.follower_id = f.followee_id AND back.followee_id = ${viewerId}
    JOIN ${profiles} AS pr ON pr.id = f.followee_id AND pr.status = 'active'
    WHERE f.follower_id = ${viewerId}
      AND NOT EXISTS (SELECT 1 FROM ${blocks} AS bl
        WHERE (bl.blocker_id = ${viewerId} AND bl.blocked_id = f.followee_id)
           OR (bl.blocker_id = f.followee_id AND bl.blocked_id = ${viewerId}))`;
}

/** `canViewContent` de l'auteur `p` du reel pour `viewerId`, en SQL (ADR-006). */
function reelVisibleTo(viewerId: string): SQL {
  return sql`p.kind = 'reel' AND p.deleted_at IS NULL AND p.author_id <> ${viewerId}
    AND author.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM ${blocks} AS b
      WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = p.author_id)
         OR (b.blocker_id = p.author_id AND b.blocked_id = ${viewerId}))
    AND (author.is_private = false OR EXISTS (SELECT 1 FROM ${follows} AS vf
      WHERE vf.follower_id = ${viewerId} AND vf.followee_id = p.author_id))`;
}

/** Requête du feed d'ADR-007 en Drizzle, validée par `EXPLAIN ANALYZE` sur les données du seed. */
export class DrizzleFeedReader implements FeedReader {
  constructor(private readonly db: Executor) {}

  async listReelsFeed({ viewerId, after, limit }: FeedQuery): Promise<Page<Post>> {
    // Traduction SQL de canViewContent (ADR-006), sans les propres reels du lecteur.
    const rows = await selectPosts(
      this.db,
      viewerId,
      and(
        eq(posts.kind, 'reel'),
        ne(posts.authorId, viewerId),
        eq(profiles.status, 'active'),
        sql`NOT EXISTS (SELECT 1 FROM ${blocks} AS b
        WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${posts.authorId})
           OR (b.blocker_id = ${posts.authorId} AND b.blocked_id = ${viewerId}))`,
        sql`(${profiles.isPrivate} = false OR EXISTS (SELECT 1 FROM ${follows} AS f
        WHERE f.follower_id = ${viewerId} AND f.followee_id = ${posts.authorId}))`,
        postsBefore(after),
      ),
      limit + 1,
    );
    return pageOf(rows, limit);
  }

  async listFriendsReels({ viewerId, after, limit }: FeedQuery): Promise<Page<FriendsReelEntry>> {
    // Union des trois sources calculée à la lecture, un reel une fois à sa date d'activité la plus
    // récente (ADR-029) ; validée par `EXPLAIN ANALYZE` sur le seed.
    const latest = sql`(
      WITH friends AS (${friendsOf(viewerId)}),
      interactions AS (
        SELECT r.id AS post_id, r.created_at AS at FROM ${posts} AS r
          JOIN friends ON friends.id = r.author_id
          WHERE r.kind = 'reel' AND r.deleted_at IS NULL
        UNION ALL
        SELECT l.post_id, l.created_at FROM ${postLikes} AS l
          JOIN friends ON friends.id = l.user_id AND friends.activity = 'mutuals'
        UNION ALL
        SELECT c.post_id, c.created_at FROM ${comments} AS c
          JOIN friends ON friends.id = c.author_id AND friends.activity = 'mutuals'
          WHERE c.deleted_at IS NULL
      )
      SELECT post_id, max(at) AS activity_at FROM interactions GROUP BY post_id
    ) AS latest`;
    const activityAt = sql`latest.activity_at`.mapWith(posts.createdAt);
    const rows = await this.db
      .select({ postId: sql<string>`latest.post_id`, activityAt })
      .from(latest)
      .innerJoin(sql`${posts} AS p`, sql`p.id = latest.post_id`)
      .innerJoin(sql`${profiles} AS author`, sql`author.id = p.author_id`)
      .where(
        and(
          reelVisibleTo(viewerId),
          after
            ? sql`(latest.activity_at, latest.post_id) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(sql`latest.activity_at DESC, latest.post_id DESC`)
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const found = await selectPosts(
      this.db,
      viewerId,
      page.length > 0
        ? inArray(
            posts.id,
            page.map((row) => row.postId),
          )
        : sql`false`,
      Math.max(page.length, 1),
    );
    const byId = new Map(found.map((post) => [post.id, post]));
    const items = page.flatMap((row) => {
      const post = byId.get(row.postId);
      return post ? [{ post, activityAt: row.activityAt }] : [];
    });
    const last = page.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { createdAt: last.activityAt, id: last.postId } : null,
    };
  }

  async listFriendInteractions(
    viewerId: string,
    postIds: readonly string[],
  ): Promise<FriendInteractionRow[]> {
    if (postIds.length === 0) return [];
    const ids = sql.join(
      postIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const source = sql`(
      WITH friends AS (${friendsOf(viewerId)})
      SELECT r.id AS post_id, r.author_id AS friend_id, 'created' AS kind, r.created_at AS at,
          NULL::text AS comment_text
        FROM ${posts} AS r JOIN friends ON friends.id = r.author_id
        WHERE r.id IN (${ids})
      UNION ALL
      SELECT l.post_id, l.user_id, 'liked', l.created_at, NULL
        FROM ${postLikes} AS l
        JOIN friends ON friends.id = l.user_id AND friends.activity = 'mutuals'
        WHERE l.post_id IN (${ids})
      UNION ALL
      SELECT * FROM (
        SELECT DISTINCT ON (c.post_id, c.author_id) c.post_id, c.author_id, 'commented',
            c.created_at, c.body
          FROM ${comments} AS c
          JOIN friends ON friends.id = c.author_id AND friends.activity = 'mutuals'
          WHERE c.post_id IN (${ids}) AND c.deleted_at IS NULL
          ORDER BY c.post_id, c.author_id, c.created_at DESC, c.id DESC
      ) AS latest_comments
    ) AS i`;
    const rows = await this.db
      .select({
        postId: sql<string>`i.post_id`,
        kind: sql<FriendInteractionKind>`i.kind`,
        at: sql`i.at`.mapWith(posts.createdAt),
        commentText: sql<string | null>`i.comment_text`,
        friendId: profiles.id,
        username: profiles.username,
        avatarVariants: media.variants,
      })
      .from(source)
      .innerJoin(profiles, sql`${profiles.id} = i.friend_id`)
      .leftJoin(media, eq(media.id, profiles.avatarMediaId));
    return rows.map((row) => ({
      postId: row.postId,
      kind: row.kind,
      at: row.at,
      ...(row.commentText !== null && { commentText: row.commentText }),
      friend: {
        id: row.friendId,
        username: row.username,
        avatarVariants: imageVariants(row.avatarVariants),
      },
    }));
  }

  async findReel(postId: string, viewerId: string): Promise<Post | null> {
    const [post] = await selectPosts(
      this.db,
      viewerId,
      and(eq(posts.id, postId), eq(posts.kind, 'reel')),
      1,
    );
    return post ?? null;
  }

  async listFeed({ viewerId, after, limit }: FeedQuery): Promise<Page<Post>> {
    // Une ligne de plus pour savoir s'il existe une page suivante.
    const rows = await selectPosts(
      this.db,
      viewerId,
      and(
        // Comptes suivis, et soi-même.
        sql`(${posts.authorId} = ${viewerId} OR EXISTS (
          SELECT 1 FROM ${follows} AS f
          WHERE f.follower_id = ${viewerId} AND f.followee_id = ${posts.authorId}
        ))`,
        // `canViewProfile` (ADR-006) : soi-même, ou compte actif sans blocage dans un sens ou dans l'autre.
        sql`(${posts.authorId} = ${viewerId} OR (${profiles.status} = 'active' AND NOT EXISTS (
          SELECT 1 FROM ${blocks} AS b
          WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${posts.authorId})
             OR (b.blocker_id = ${posts.authorId} AND b.blocked_id = ${viewerId})
        )))`,
        postsBefore(after),
      ),
      limit + 1,
    );
    return pageOf(rows, limit);
  }
}

function imageVariants(variants: MediaVariantPaths | null) {
  return variants && 'thumb' in variants ? variants : null;
}

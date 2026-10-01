import { blocks, follows, posts, profiles, type Executor } from '@clone/db';
import { and, sql } from 'drizzle-orm';

import type { Page } from '../../../../shared/domain/pagination.ts';
import type { Post } from '../../../posts/domain/post.ts';
import {
  pageOf,
  postsBefore,
  selectPosts,
} from '../../../posts/infrastructure/persistence/drizzle-post-repository.ts';
import type { FeedQuery, FeedReader } from '../../application/ports/feed-reader.ts';

/** Requête du feed d'ADR-007 en Drizzle, validée par `EXPLAIN ANALYZE` sur les données du seed. */
export class DrizzleFeedReader implements FeedReader {
  constructor(private readonly db: Executor) {}

  async listFeed({ viewerId, after, limit }: FeedQuery): Promise<Page<Post>> {
    // Une ligne de plus pour savoir s'il existe une page suivante.
    const rows = await selectPosts(
      this.db,
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

import { postLikes, posts, profiles, type Executor } from '@clone/db';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type {
  LikeablePost,
  LikeablePostReader,
  LikeRepository,
} from '../../application/ports/like-repository.ts';

/** Post non supprimé et son auteur, lus avant un like ou un unlike. */
export class DrizzleLikeablePostReader implements LikeablePostReader {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<LikeablePost | null> {
    const [row] = await this.db
      .select({
        id: posts.id,
        likeCount: posts.likeCount,
        authorId: profiles.id,
        status: profiles.status,
        isPrivate: profiles.isPrivate,
      })
      .from(posts)
      .innerJoin(profiles, eq(profiles.id, posts.authorId))
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)));
    if (!row) return null;
    return {
      id: row.id,
      likeCount: row.likeCount,
      author: { id: row.authorId, status: row.status, isPrivate: row.isPrivate },
    };
  }
}

/** Likes : `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, sans effet si rien ne change. */
export class DrizzleLikeRepository implements LikeRepository {
  constructor(private readonly db: Executor) {}

  async add(userId: string, postId: string): Promise<boolean> {
    const rows = await this.db
      .insert(postLikes)
      .values({ userId, postId })
      .onConflictDoNothing()
      .returning({ userId: postLikes.userId });
    return rows.length > 0;
  }

  async remove(userId: string, postId: string): Promise<boolean> {
    const rows = await this.db
      .delete(postLikes)
      .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)))
      .returning({ userId: postLikes.userId });
    return rows.length > 0;
  }

  /** Incrément atomique (ADR-007) : deux likes simultanés ne perdent aucune mise à jour. */
  async applyLikeCount(postId: string, delta: 1 | -1): Promise<number> {
    const [row] = await this.db
      .update(posts)
      .set({ likeCount: sql`${posts.likeCount} + ${delta}::int` })
      .where(eq(posts.id, postId))
      .returning({ likeCount: posts.likeCount });
    if (!row) throw new Error('Post absent lors de la mise à jour de like_count');
    return row.likeCount;
  }
}

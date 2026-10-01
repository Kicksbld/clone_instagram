import type {
  LikeablePost,
  LikeablePostReader,
  LikeRepository,
} from '../../src/modules/engagement/application/ports/like-repository.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que les adapters Drizzle du module `engagement`
 * (posts non supprimés, like unique par utilisateur et par post), sur les posts en mémoire.
 */
export class InMemoryLikes implements LikeablePostReader, LikeRepository {
  constructor(private readonly posts: InMemoryPosts) {}

  async findById(id: string): Promise<LikeablePost | null> {
    const row = this.posts.rows.get(id);
    if (!row || row.deletedAt) return null;
    const post = await this.posts.findById(id, row.authorId);
    if (!post) return null;
    return { id, likeCount: row.likeCount, author: post.author };
  }

  add(userId: string, postId: string): Promise<boolean> {
    const key = `${userId}:${postId}`;
    if (this.posts.likes.has(key)) return Promise.resolve(false);
    this.posts.likes.add(key);
    return Promise.resolve(true);
  }

  remove(userId: string, postId: string): Promise<boolean> {
    return Promise.resolve(this.posts.likes.delete(`${userId}:${postId}`));
  }

  applyLikeCount(postId: string, delta: 1 | -1): Promise<number> {
    const row = this.posts.rows.get(postId);
    if (!row) throw new Error(`Post absent : ${postId}`);
    const likeCount = row.likeCount + delta;
    this.posts.rows.set(postId, { ...row, likeCount });
    return Promise.resolve(likeCount);
  }
}

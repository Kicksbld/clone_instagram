import type {
  CommentReader,
  CommentRepository,
  CommentsQuery,
  CommentTarget,
  NewComment,
} from '../../src/modules/engagement/application/ports/comment-repository.ts';
import type { Comment } from '../../src/modules/engagement/domain/comment.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';

type CommentRow = NewComment & { replyCount: number; deletedAt: Date | null };

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que les adapters Drizzle des commentaires
 * (commentaires et posts non supprimés, auteurs bloqués ou non actifs absents des listes, ordre
 * `(created_at, id)` décroissant).
 */
export class InMemoryComments implements CommentRepository, CommentReader {
  readonly rows = new Map<string, CommentRow>();

  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly posts: InMemoryPosts,
    private readonly relationships: InMemoryRelationshipReader,
  ) {}

  create(comment: NewComment): Promise<void> {
    this.rows.set(comment.id, { ...comment, replyCount: 0, deletedAt: null });
    return Promise.resolve();
  }

  findTarget(id: string): Promise<CommentTarget | null> {
    const row = this.live(id);
    const post = row && this.posts.rows.get(row.postId);
    if (!row || !post || post.deletedAt) return Promise.resolve(null);
    return Promise.resolve({
      id: row.id,
      postId: row.postId,
      parentId: row.parentId,
      author: this.subject(row.authorId),
      postAuthor: this.subject(post.authorId),
    });
  }

  softDeleteWithReplies(id: string): Promise<number> {
    if (!this.live(id)) return Promise.resolve(0);
    let deleted = 0;
    for (const row of this.rows.values()) {
      if (!row.deletedAt && (row.id === id || row.parentId === id)) {
        this.rows.set(row.id, { ...row, deletedAt: new Date() });
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }

  applyCommentCount(postId: string, delta: number): Promise<void> {
    const post = this.posts.rows.get(postId);
    if (post)
      this.posts.rows.set(postId, { ...post, commentCount: (post.commentCount ?? 0) + delta });
    return Promise.resolve();
  }

  applyReplyCount(commentId: string, delta: 1 | -1): Promise<void> {
    const row = this.rows.get(commentId);
    if (row) this.rows.set(commentId, { ...row, replyCount: row.replyCount + delta });
    return Promise.resolve();
  }

  findById(id: string): Promise<Comment | null> {
    const row = this.live(id);
    return Promise.resolve(row && this.postIsLive(row) ? this.toComment(row) : null);
  }

  listByPost(postId: string, query: CommentsQuery): Promise<Page<Comment>> {
    return Promise.resolve(
      this.list((row) => row.postId === postId && row.parentId === null, query),
    );
  }

  listReplies(parentId: string, query: CommentsQuery): Promise<Page<Comment>> {
    return Promise.resolve(this.list((row) => row.parentId === parentId, query));
  }

  private list(keep: (row: CommentRow) => boolean, query: CommentsQuery): Page<Comment> {
    const { viewerId, after, limit } = query;
    const rows = [...this.rows.values()]
      .filter((row) => !row.deletedAt && this.postIsLive(row) && keep(row))
      .filter((row) => {
        if (row.authorId === viewerId) return true;
        const author = this.subject(row.authorId);
        return (
          author.status === 'active' &&
          !this.relationships.isBlockedEitherWay(viewerId, row.authorId)
        );
      })
      .filter((row) => !after || compare(row, after) < 0)
      .sort((a, b) => compare(b, a));
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toComment(row)),
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  private live(id: string): CommentRow | undefined {
    const row = this.rows.get(id);
    return row && !row.deletedAt ? row : undefined;
  }

  private postIsLive(row: CommentRow): boolean {
    const post = this.posts.rows.get(row.postId);
    return Boolean(post && !post.deletedAt);
  }

  private subject(profileId: string) {
    const profile = this.profiles.rows.get(profileId);
    if (!profile) throw new Error(`Profil absent : ${profileId}`);
    return { id: profile.id, status: profile.status, isPrivate: profile.isPrivate };
  }

  private toComment(row: CommentRow): Comment {
    const post = this.posts.rows.get(row.postId);
    const author = this.profiles.rows.get(row.authorId);
    if (!post || !author) throw new Error(`Commentaire orphelin : ${row.id}`);
    return {
      id: row.id,
      postId: row.postId,
      postAuthorId: post.authorId,
      parentId: row.parentId,
      body: row.body,
      replyCount: row.replyCount,
      createdAt: row.createdAt,
      author: {
        id: author.id,
        username: author.username,
        status: author.status,
        isPrivate: author.isPrivate,
        avatarVariants: author.avatar?.variants ?? null,
      },
    };
  }
}

function compare(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number {
  const byDate = a.createdAt.getTime() - b.createdAt.getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

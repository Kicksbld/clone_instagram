import { blocks, comments, media, posts, profiles, type Executor } from '@clone/db';
import { aliasedTable, and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type {
  CommentReader,
  CommentRepository,
  CommentsQuery,
  CommentTarget,
  NewComment,
} from '../../application/ports/comment-repository.ts';
import type { Comment } from '../../domain/comment.ts';

const postAuthor = aliasedTable(profiles, 'post_author');
const avatar = aliasedTable(media, 'avatar');

/** Écritures des commentaires et de leurs compteurs, sur une connexion ou dans une transaction. */
export class DrizzleCommentRepository implements CommentRepository {
  constructor(private readonly db: Executor) {}

  async create(comment: NewComment): Promise<void> {
    await this.db.insert(comments).values(comment);
  }

  async findTarget(id: string): Promise<CommentTarget | null> {
    const [row] = await this.db
      .select({
        id: comments.id,
        postId: comments.postId,
        parentId: comments.parentId,
        authorId: profiles.id,
        authorStatus: profiles.status,
        authorIsPrivate: profiles.isPrivate,
        postAuthorId: postAuthor.id,
        postAuthorStatus: postAuthor.status,
        postAuthorIsPrivate: postAuthor.isPrivate,
      })
      .from(comments)
      .innerJoin(profiles, eq(profiles.id, comments.authorId))
      .innerJoin(posts, eq(posts.id, comments.postId))
      .innerJoin(postAuthor, eq(postAuthor.id, posts.authorId))
      .where(and(eq(comments.id, id), isNull(comments.deletedAt), isNull(posts.deletedAt)));
    if (!row) return null;
    return {
      id: row.id,
      postId: row.postId,
      parentId: row.parentId,
      author: { id: row.authorId, status: row.authorStatus, isPrivate: row.authorIsPrivate },
      postAuthor: {
        id: row.postAuthorId,
        status: row.postAuthorStatus,
        isPrivate: row.postAuthorIsPrivate,
      },
    };
  }

  async softDeleteWithReplies(id: string): Promise<number> {
    const deleted = await this.db
      .update(comments)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    if (deleted.length === 0) return 0;
    const replies = await this.db
      .update(comments)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(comments.parentId, id), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    return 1 + replies.length;
  }

  /** Mises à jour atomiques (ADR-007) : deux commentaires simultanés ne perdent aucune écriture. */
  async applyCommentCount(postId: string, delta: number): Promise<void> {
    await this.db
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + ${delta}::int` })
      .where(eq(posts.id, postId));
  }

  async applyReplyCount(commentId: string, delta: 1 | -1): Promise<void> {
    await this.db
      .update(comments)
      .set({ replyCount: sql`${comments.replyCount} + ${delta}::int` })
      .where(eq(comments.id, commentId));
  }
}

/** Lectures des commentaires non supprimés, avec leur auteur. */
export class DrizzleCommentReader implements CommentReader {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Comment | null> {
    const [comment] = await this.select(eq(comments.id, id), 1);
    return comment ?? null;
  }

  listByPost(postId: string, query: CommentsQuery): Promise<Page<Comment>> {
    return this.page(and(eq(comments.postId, postId), isNull(comments.parentId)), query);
  }

  listReplies(parentId: string, query: CommentsQuery): Promise<Page<Comment>> {
    return this.page(eq(comments.parentId, parentId), query);
  }

  private async page(
    where: SQL | undefined,
    { viewerId, after, limit }: CommentsQuery,
  ): Promise<Page<Comment>> {
    const rows = await this.select(
      and(
        where,
        // `canViewProfile` (ADR-006) : soi-même, ou compte actif sans blocage dans un sens ou dans l'autre.
        sql`(${comments.authorId} = ${viewerId} OR (${profiles.status} = 'active' AND NOT EXISTS (
          SELECT 1 FROM ${blocks} AS b
          WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${comments.authorId})
             OR (b.blocker_id = ${comments.authorId} AND b.blocked_id = ${viewerId})
        )))`,
        commentsBefore(after),
      ),
      // Une ligne de plus pour savoir s'il existe une page suivante.
      limit + 1,
    );
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  /** Commentaires non supprimés d'un post non supprimé, du plus récent au plus ancien. */
  private async select(where: SQL | undefined, limit: number): Promise<Comment[]> {
    const rows = await this.db
      .select({
        id: comments.id,
        postId: comments.postId,
        postAuthorId: posts.authorId,
        parentId: comments.parentId,
        body: comments.body,
        replyCount: comments.replyCount,
        createdAt: comments.createdAt,
        authorId: profiles.id,
        username: profiles.username,
        status: profiles.status,
        isPrivate: profiles.isPrivate,
        avatarVariants: avatar.variants,
      })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .innerJoin(profiles, eq(profiles.id, comments.authorId))
      .leftJoin(avatar, eq(avatar.id, profiles.avatarMediaId))
      .where(and(isNull(comments.deletedAt), isNull(posts.deletedAt), where))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      postAuthorId: row.postAuthorId,
      parentId: row.parentId,
      body: row.body,
      replyCount: row.replyCount,
      createdAt: row.createdAt,
      author: {
        id: row.authorId,
        username: row.username,
        status: row.status,
        isPrivate: row.isPrivate,
        avatarVariants: row.avatarVariants,
      },
    }));
  }
}

/** Commentaires strictement plus anciens que le curseur `(created_at, id)` (ADR-007). */
function commentsBefore(after: PageCursor | null): SQL | undefined {
  return after
    ? sql`(${comments.createdAt}, ${comments.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
    : undefined;
}

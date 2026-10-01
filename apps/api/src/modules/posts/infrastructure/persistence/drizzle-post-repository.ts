import { media, postLikes, postMedia, posts, profiles, type Executor } from '@clone/db';
import { aliasedTable, and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import type {
  AuthorPostsQuery,
  NewPost,
  PostReader,
  PostRepository,
} from '../../application/ports/post-repository.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Post, PostMediaItem } from '../../domain/post.ts';

/** Écritures des posts, sur une connexion ou dans une transaction. */
export class DrizzlePostRepository implements PostRepository {
  constructor(private readonly db: Executor) {}

  async create(post: NewPost): Promise<void> {
    await this.db.insert(posts).values({
      id: post.id,
      authorId: post.authorId,
      kind: post.kind,
      caption: post.caption,
      createdAt: post.createdAt,
      updatedAt: post.createdAt,
    });
    await this.db
      .insert(postMedia)
      .values(post.mediaIds.map((mediaId, position) => ({ postId: post.id, mediaId, position })));
  }

  async incrementPostCount(authorId: string): Promise<void> {
    await this.db
      .update(profiles)
      .set({ postCount: sql`${profiles.postCount} + 1`, updatedAt: sql`now()` })
      .where(eq(profiles.id, authorId));
  }

  async softDelete(id: string, authorId: string): Promise<string[] | null> {
    const deleted = await this.db
      .update(posts)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(posts.id, id), eq(posts.authorId, authorId), isNull(posts.deletedAt)))
      .returning({ id: posts.id });
    if (deleted.length === 0) return null;

    const rows = await this.db
      .select({ mediaId: postMedia.mediaId })
      .from(postMedia)
      .where(eq(postMedia.postId, id))
      .orderBy(asc(postMedia.position));
    return rows.map((row) => row.mediaId);
  }

  async decrementPostCount(authorId: string): Promise<void> {
    await this.db
      .update(profiles)
      .set({ postCount: sql`${profiles.postCount} - 1`, updatedAt: sql`now()` })
      .where(eq(profiles.id, authorId));
  }
}

const avatar = aliasedTable(media, 'avatar');

/** Lectures des posts non supprimés : une requête pour les posts et auteurs, une pour les médias. */
export class DrizzlePostReader implements PostReader {
  constructor(private readonly db: Executor) {}

  async findById(id: string, viewerId: string): Promise<Post | null> {
    const [post] = await selectPosts(this.db, viewerId, eq(posts.id, id), 1);
    return post ?? null;
  }

  async listByAuthor({ viewerId, authorId, after, limit }: AuthorPostsQuery): Promise<Page<Post>> {
    // Une ligne de plus pour savoir s'il existe une page suivante.
    const rows = await selectPosts(
      this.db,
      viewerId,
      and(eq(posts.authorId, authorId), postsBefore(after)),
      limit + 1,
    );
    return pageOf(rows, limit);
  }
}

/** Posts strictement plus anciens que le curseur `(created_at, id)` (ADR-007). */
export function postsBefore(after: PageCursor | null): SQL | undefined {
  return after
    ? sql`(${posts.createdAt}, ${posts.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
    : undefined;
}

/** Page à partir de `limit + 1` lignes : la ligne en trop signale une page suivante. */
export function pageOf(rows: Post[], limit: number): Page<Post> {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page,
    next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

/**
 * Posts non supprimés filtrés par `where`, du plus récent au plus ancien, avec auteur, médias et
 * likes vus par `viewerId`. Partagé par les lectures de posts et le feed (ADR-007).
 */
export async function selectPosts(
  db: Executor,
  viewerId: string,
  where: SQL | undefined,
  limit: number,
): Promise<Post[]> {
  const rows = await db
    .select({
      id: posts.id,
      kind: posts.kind,
      caption: posts.caption,
      likeCount: posts.likeCount,
      // Clé primaire `(user_id, post_id)` de `post_likes`.
      viewerHasLiked: sql<boolean>`EXISTS (
        SELECT 1 FROM ${postLikes} AS l WHERE l.user_id = ${viewerId} AND l.post_id = ${posts.id}
      )`,
      createdAt: posts.createdAt,
      authorId: profiles.id,
      username: profiles.username,
      status: profiles.status,
      isPrivate: profiles.isPrivate,
      avatarVariants: avatar.variants,
    })
    .from(posts)
    .innerJoin(profiles, eq(profiles.id, posts.authorId))
    .leftJoin(avatar, eq(avatar.id, profiles.avatarMediaId))
    .where(and(isNull(posts.deletedAt), where))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit);
  if (rows.length === 0) return [];

  const mediaRows = await db
    .select({
      postId: postMedia.postId,
      variants: media.variants,
      width: media.width,
      height: media.height,
    })
    .from(postMedia)
    .innerJoin(media, eq(media.id, postMedia.mediaId))
    .where(
      inArray(
        postMedia.postId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(postMedia.postId), asc(postMedia.position));

  const mediaByPost = new Map<string, PostMediaItem[]>();
  for (const row of mediaRows) {
    // Un média rattaché est toujours `ready` : variantes et dimensions sont renseignées.
    if (!row.variants || row.width === null || row.height === null) {
      throw new Error(`Média de post incomplet (post ${row.postId})`);
    }
    const items = mediaByPost.get(row.postId) ?? [];
    items.push({ variants: row.variants, width: row.width, height: row.height });
    mediaByPost.set(row.postId, items);
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    caption: row.caption,
    likeCount: row.likeCount,
    viewerHasLiked: row.viewerHasLiked,
    createdAt: row.createdAt,
    author: {
      id: row.authorId,
      username: row.username,
      status: row.status,
      isPrivate: row.isPrivate,
      avatarVariants: row.avatarVariants,
    },
    media: mediaByPost.get(row.id) ?? [],
  }));
}

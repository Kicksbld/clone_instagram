import type {
  AuthorPostsQuery,
  NewPost,
  PostReader,
  PostRepository,
} from '../../src/modules/posts/application/ports/post-repository.ts';
import type { Post } from '../../src/modules/posts/domain/post.ts';
import type { Page, PageCursor } from '../../src/shared/domain/pagination.ts';
import type { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';

/** Dimensions des images de test (4:5), que le worker aurait écrites. */
export const TEST_IMAGE_SIZE = { width: 1080, height: 1350 };

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que `DrizzlePostReader` (posts non supprimés, ordre
 * `(created_at, id)` décroissant) ; auteurs et médias lus dans les autres adapters en mémoire.
 */
export class InMemoryPosts implements PostRepository, PostReader {
  readonly rows = new Map<string, NewPost & { deletedAt: Date | null; likeCount: number }>();
  /** Likes (`post_likes`), clé `userId:postId` ; écrits par `InMemoryLikes`. */
  readonly likes = new Set<string>();

  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly media: InMemoryMediaRepository,
  ) {}

  create(post: NewPost): Promise<void> {
    this.rows.set(post.id, { ...post, deletedAt: null, likeCount: 0 });
    return Promise.resolve();
  }

  incrementPostCount(authorId: string): Promise<void> {
    const profile = this.profiles.rows.get(authorId);
    if (profile) this.profiles.rows.set(authorId, { ...profile, postCount: profile.postCount + 1 });
    return Promise.resolve();
  }

  softDelete(id: string, authorId: string): Promise<string[] | null> {
    const row = this.rows.get(id);
    if (!row || row.authorId !== authorId || row.deletedAt) return Promise.resolve(null);
    this.rows.set(id, { ...row, deletedAt: new Date() });
    return Promise.resolve(row.mediaIds);
  }

  decrementPostCount(authorId: string): Promise<void> {
    const profile = this.profiles.rows.get(authorId);
    if (profile) this.profiles.rows.set(authorId, { ...profile, postCount: profile.postCount - 1 });
    return Promise.resolve();
  }

  findById(id: string, viewerId: string): Promise<Post | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && !row.deletedAt ? this.toPost(row, viewerId) : null);
  }

  listByAuthor({ viewerId, authorId, after, limit }: AuthorPostsQuery): Promise<Page<Post>> {
    return Promise.resolve(
      this.list(viewerId, (post) => post.author.id === authorId, after, limit),
    );
  }

  /** Posts non supprimés retenus par `keep`, du plus récent au plus ancien (feed, grille). */
  list(
    viewerId: string,
    keep: (post: Post) => boolean,
    after: PageCursor | null,
    limit: number,
  ): Page<Post> {
    const rows = [...this.rows.values()]
      .filter((row) => !row.deletedAt)
      .filter((row) => !after || compare(row, after) < 0)
      .sort((a, b) => compare(b, a))
      .map((row) => this.toPost(row, viewerId))
      .filter(keep);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  private toPost(row: NewPost & { likeCount: number }, viewerId: string): Post {
    const author = this.profiles.rows.get(row.authorId);
    if (!author) throw new Error(`Auteur absent : ${row.authorId}`);
    return {
      id: row.id,
      kind: row.kind,
      caption: row.caption,
      likeCount: row.likeCount,
      viewerHasLiked: this.likes.has(`${viewerId}:${row.id}`),
      createdAt: row.createdAt,
      author: {
        id: author.id,
        username: author.username,
        status: author.status,
        isPrivate: author.isPrivate,
        avatarVariants: author.avatar?.variants ?? null,
      },
      media: row.mediaIds.map((mediaId) => {
        const variants = this.media.rows.get(mediaId)?.variants;
        if (!variants) throw new Error(`Média de post sans variantes : ${mediaId}`);
        return { variants, ...TEST_IMAGE_SIZE };
      }),
    };
  }
}

function compare(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number {
  const byDate = a.createdAt.getTime() - b.createdAt.getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

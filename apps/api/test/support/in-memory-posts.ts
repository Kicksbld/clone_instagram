import type {
  AuthorPostsQuery,
  NewPost,
  PostReader,
  PostRepository,
} from '../../src/modules/posts/application/ports/post-repository.ts';
import type { Post } from '../../src/modules/posts/domain/post.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import type { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';

/** Dimensions des images de test (4:5), que le worker aurait écrites. */
export const TEST_IMAGE_SIZE = { width: 1080, height: 1350 };

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que `DrizzlePostReader` (posts non supprimés, ordre
 * `(created_at, id)` décroissant) ; auteurs et médias lus dans les autres adapters en mémoire.
 */
export class InMemoryPosts implements PostRepository, PostReader {
  readonly rows = new Map<string, NewPost & { deletedAt: Date | null }>();

  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly media: InMemoryMediaRepository,
  ) {}

  create(post: NewPost): Promise<void> {
    this.rows.set(post.id, { ...post, deletedAt: null });
    return Promise.resolve();
  }

  incrementPostCount(authorId: string): Promise<void> {
    const profile = this.profiles.rows.get(authorId);
    if (profile) this.profiles.rows.set(authorId, { ...profile, postCount: profile.postCount + 1 });
    return Promise.resolve();
  }

  findById(id: string): Promise<Post | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && !row.deletedAt ? this.toPost(row) : null);
  }

  listByAuthor({ authorId, after, limit }: AuthorPostsQuery): Promise<Page<Post>> {
    const rows = [...this.rows.values()]
      .filter((row) => row.authorId === authorId && !row.deletedAt)
      .filter((row) => !after || compare(row, after) < 0)
      .sort((a, b) => compare(b, a));
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return Promise.resolve({
      items: page.map((row) => this.toPost(row)),
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    });
  }

  private toPost(row: NewPost): Post {
    const author = this.profiles.rows.get(row.authorId);
    if (!author) throw new Error(`Auteur absent : ${row.authorId}`);
    return {
      id: row.id,
      kind: row.kind,
      caption: row.caption,
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

import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import { COMMENTS_PAGE_SIZE, type CommentView, viewOf } from '../../domain/comment.ts';
import type { CommentReader } from '../ports/comment-repository.ts';
import type { LikeablePostReader } from '../ports/like-repository.ts';
import { requireVisiblePost } from '../require-visible-post.ts';

/**
 * Commentaires de premier niveau d'un post visible (ADR-006), du plus récent au plus ancien ;
 * post invisible → `post_not_found`.
 */
export class ListComments {
  constructor(
    private readonly relationships: RelationshipReader,
    private readonly posts: LikeablePostReader,
    private readonly comments: CommentReader,
  ) {}

  async execute(input: {
    viewerId: string;
    postId: string;
    after: PageCursor | null;
  }): Promise<Page<CommentView>> {
    const post = await requireVisiblePost(
      { relationships: this.relationships, posts: this.posts },
      input.viewerId,
      input.postId,
    );
    const page = await this.comments.listByPost(post.id, {
      viewerId: input.viewerId,
      after: input.after,
      limit: COMMENTS_PAGE_SIZE,
    });
    return { items: page.items.map((c) => viewOf(c, input.viewerId)), next: page.next };
  }
}

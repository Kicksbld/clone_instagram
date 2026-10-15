import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import { canViewContent, SELF_RELATIONSHIP } from '../../../../shared/domain/visibility.ts';
import { COMMENTS_PAGE_SIZE, type CommentView, viewOf } from '../../domain/comment.ts';
import { CommentNotFoundError } from '../../domain/errors.ts';
import type { CommentReader, CommentRepository } from '../ports/comment-repository.ts';
import { canSeeCommentAuthor } from '../require-visible-post.ts';

/**
 * Réponses à un commentaire, du plus récent au plus ancien. Commentaire supprimé, ou dont le post
 * ou l'auteur est invisible pour l'appelant (ADR-006) → `comment_not_found`.
 */
export class ListReplies {
  constructor(
    private readonly relationships: RelationshipReader,
    private readonly comments: CommentRepository,
    private readonly reader: CommentReader,
  ) {}

  async execute(input: {
    viewerId: string;
    commentId: string;
    after: PageCursor | null;
  }): Promise<Page<CommentView>> {
    const { viewerId } = input;
    const comment = await this.comments.findTarget(input.commentId);
    if (!comment) throw new CommentNotFoundError();
    const { postAuthor } = comment;
    const relation =
      postAuthor.id === viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(viewerId, postAuthor.id);
    if (
      !canViewContent(viewerId, postAuthor, relation) ||
      !(await canSeeCommentAuthor(this.relationships, viewerId, comment.author))
    ) {
      throw new CommentNotFoundError();
    }

    const page = await this.reader.listReplies(comment.id, {
      viewerId,
      after: input.after,
      limit: COMMENTS_PAGE_SIZE,
    });
    return { items: page.items.map((c) => viewOf(c, viewerId)), next: page.next };
  }
}

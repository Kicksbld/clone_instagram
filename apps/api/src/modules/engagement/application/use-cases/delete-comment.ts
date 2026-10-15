import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewContent, SELF_RELATIONSHIP } from '../../../../shared/domain/visibility.ts';
import { canDeleteComment } from '../../domain/comment.ts';
import { CommentNotFoundError } from '../../domain/errors.ts';
import type { CommentTransaction } from '../ports/comment-transaction.ts';

/**
 * Supprimer un commentaire (suppression logique) : par son auteur ou par l'auteur du post, qui voit
 * le post. Ses réponses sont supprimées avec lui : `comment_count` baisse de 1 + nombre de réponses ;
 * une réponse baisse aussi le `reply_count` de son parent. Sinon `comment_not_found`, jamais 403.
 */
export class DeleteComment {
  constructor(private readonly transaction: UnitOfWork<CommentTransaction>) {}

  execute(input: { viewerId: string; commentId: string }): Promise<void> {
    const { viewerId } = input;
    return this.transaction.run(async ({ relationships, comments }) => {
      const comment = await comments.findTarget(input.commentId);
      if (!comment) throw new CommentNotFoundError();
      const { postAuthor } = comment;
      if (!canDeleteComment(viewerId, { author: comment.author, postAuthorId: postAuthor.id })) {
        throw new CommentNotFoundError();
      }
      const relation =
        postAuthor.id === viewerId
          ? SELF_RELATIONSHIP
          : await relationships.between(viewerId, postAuthor.id);
      if (!canViewContent(viewerId, postAuthor, relation)) throw new CommentNotFoundError();

      // Écriture conditionnelle : une double suppression simultanée ne passe qu'une fois.
      const deleted = await comments.softDeleteWithReplies(comment.id);
      if (deleted === 0) throw new CommentNotFoundError();
      await comments.applyCommentCount(comment.postId, -deleted);
      if (comment.parentId) await comments.applyReplyCount(comment.parentId, -1);
    });
  }
}

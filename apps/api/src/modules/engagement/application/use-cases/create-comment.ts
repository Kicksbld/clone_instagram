import type { Clock } from '../../../../shared/application/clock.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { type CommentView, normalizeCommentBody, viewOf } from '../../domain/comment.ts';
import { CommentNotFoundError, ReplyToReplyError } from '../../domain/errors.ts';
import type { CommentTransaction } from '../ports/comment-transaction.ts';
import { canSeeCommentAuthor, requireEngageablePost } from '../require-visible-post.ts';

export interface CreateCommentInput {
  authorId: string;
  postId: string;
  body: string;
  parentId?: string;
}

/**
 * Commenter un post visible, ou répondre à un commentaire de premier niveau de ce post (un seul
 * niveau). Dans une transaction : commentaire, `comment_count` du post et `reply_count` du parent.
 */
export class CreateComment {
  constructor(
    private readonly transaction: UnitOfWork<CommentTransaction>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateCommentInput): Promise<CommentView> {
    const body = normalizeCommentBody(input.body);

    return this.transaction.run(async (scope) => {
      const post = await requireEngageablePost(scope, input.authorId, input.postId);

      const parentId = input.parentId ?? null;
      if (parentId) {
        const parent = await scope.comments.findTarget(parentId);
        if (
          !parent ||
          parent.postId !== post.id ||
          !(await canSeeCommentAuthor(scope.relationships, input.authorId, parent.author))
        ) {
          throw new CommentNotFoundError();
        }
        if (parent.parentId) throw new ReplyToReplyError();
      }

      const id = this.ids.next();
      await scope.comments.create({
        id,
        postId: post.id,
        authorId: input.authorId,
        parentId,
        body,
        createdAt: this.clock.now(),
      });
      await scope.comments.applyCommentCount(post.id, 1);
      if (parentId) await scope.comments.applyReplyCount(parentId, 1);

      const comment = await scope.reader.findById(id);
      if (!comment) throw new Error(`Commentaire créé introuvable : ${id}`);
      return viewOf(comment, input.authorId);
    });
  }
}

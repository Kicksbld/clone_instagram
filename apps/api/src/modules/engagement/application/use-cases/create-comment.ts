import { writeTextMentions } from '../../../../shared/application/write-text-mentions.ts';
import { mentionedUsernames } from '../../../../shared/domain/mention.ts';
import type { Clock } from '../../../../shared/application/clock.ts';
import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
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
 * niveau). Dans une transaction : commentaire, `comment_count` du post, `reply_count` du parent et
 * notification (ADR-026) de l'auteur du post (`comment`) ou du commentaire parent (`comment_reply`),
 * diffusée après la transaction.
 */
export class CreateComment {
  constructor(
    private readonly transaction: UnitOfWork<CommentTransaction>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: CreateCommentInput): Promise<CommentView> {
    const body = normalizeCommentBody(input.body);
    mentionedUsernames(body);

    const { view, notifications } = await this.transaction.run(async (scope) => {
      const post = await requireEngageablePost(scope, input.authorId, input.postId);

      const parentId = input.parentId ?? null;
      // Destinataire de la notification : auteur du commentaire parent, sinon auteur du post.
      let recipientId = post.author.id;
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
        recipientId = parent.author.id;
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
      const notification = await scope.notifications.notify({
        recipientId,
        actorId: input.authorId,
        type: parentId ? 'comment_reply' : 'comment',
        postId: post.id,
        commentId: id,
      });

      const mentionNotifications = await writeTextMentions(
        {
          text: body,
          authorId: input.authorId,
          contentAuthor: post.author,
          postId: post.id,
          target: { commentId: id },
          ...(notification && { alreadyNotifiedId: recipientId }),
        },
        scope,
      );
      const comment = await scope.reader.findById(id, input.authorId);
      if (!comment) throw new Error(`Commentaire créé introuvable : ${id}`);
      return {
        view: viewOf(comment, input.authorId),
        notifications: [...(notification ? [notification] : []), ...mentionNotifications],
      };
    });
    if (notifications.length) this.notifications.dispatch(notifications);
    return view;
  }
}

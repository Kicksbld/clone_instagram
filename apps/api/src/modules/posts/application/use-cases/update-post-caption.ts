import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { writeTextMentions } from '../../../../shared/application/write-text-mentions.ts';
import { mentionedUsernames } from '../../../../shared/domain/mention.ts';
import { PostNotFoundError } from '../../domain/errors.ts';
import { normalizeCaption, type Post } from '../../domain/post.ts';
import type { UpdatePostCaptionTransaction } from '../ports/update-post-caption-transaction.ts';

/**
 * Modifier la légende d'un de mes posts ou reels. Dans une transaction : légende et `updated_at`,
 * puis mentions recalculées (ADR-025) : nouvelles créées et notifiées, retirées supprimées avec
 * leur notification. Post inexistant, supprimé ou d'un autre auteur → `404 post_not_found`.
 */
import { normalizeMediaAltTexts } from '../../../../shared/domain/alt-text.ts';

export class UpdatePostCaption {
  constructor(
    private readonly transaction: UnitOfWork<UpdatePostCaptionTransaction>,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: {
    authorId: string;
    postId: string;
    caption: string;
    mediaAltTexts?: string[];
  }): Promise<Post> {
    const caption = normalizeCaption(input.caption);
    mentionedUsernames(caption);

    const { updated, notifications } = await this.transaction.run(async (scope) => {
      const { posts, reader, mentions } = scope;
      const current = await reader.findById(input.postId, input.authorId);
      if (current?.author.id !== input.authorId) throw new PostNotFoundError();
      const mediaAltTexts = normalizeMediaAltTexts(input.mediaAltTexts, current.media.length);
      if (!(await posts.updateCaption(input.postId, input.authorId, caption, mediaAltTexts)))
        throw new PostNotFoundError();

      const target = { postId: input.postId };
      const notifications = await writeTextMentions(
        {
          text: caption,
          authorId: input.authorId,
          contentAuthor: current.author,
          postId: input.postId,
          target,
          previous: await mentions.list(target),
        },
        scope,
      );
      const post = await reader.findById(input.postId, input.authorId);
      if (!post) throw new Error('Post modifié introuvable dans sa transaction');
      return { updated: post, notifications };
    });
    if (notifications.length) this.notifications.dispatch(notifications);
    return updated;
  }
}

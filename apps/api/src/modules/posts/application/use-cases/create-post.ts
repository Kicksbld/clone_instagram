import { writeTextMentions } from '../../../../shared/application/write-text-mentions.ts';
import { mentionedUsernames } from '../../../../shared/domain/mention.ts';
import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { AnalyticsTracker } from '../../../../shared/application/analytics-tracker.ts';
import type { Clock } from '../../../../shared/application/clock.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { MediaKindMismatchError, MediaNotFoundError } from '../../../media/domain/errors.ts';
import { ProfileNotFoundError } from '../../../identity/domain/errors.ts';
import { attachMediaOrThrow } from '../../../media/application/attach-media.ts';
import { normalizeCaption, type Post, type PostKind } from '../../domain/post.ts';
import type { CreatePostTransaction } from '../ports/create-post-transaction.ts';

export interface CreatePostInput {
  authorId: string;
  kind: PostKind;
  caption: string;
  mediaIds: string[];
}

/**
 * Publier un post (ADR-008) : chaque média doit être `ready`, à l'auteur, de `purpose` `post` et
 * jamais utilisé. Dans une transaction : post, rattachement des médias et `post_count` ; puis
 * `post_created` (ADR-013).
 */
export class CreatePost {
  constructor(
    private readonly transaction: UnitOfWork<CreatePostTransaction>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly analytics: AnalyticsTracker,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: CreatePostInput): Promise<Post> {
    const caption = normalizeCaption(input.caption);
    mentionedUsernames(caption);

    const { created, notifications } = await this.transaction.run(async (scope) => {
      const { accounts, media, posts, reader } = scope;
      const author = await accounts.findById(input.authorId);
      if (!author) throw new ProfileNotFoundError();

      // Validate the whole selection before attaching any media (also for in-memory transactions).
      for (const mediaId of input.mediaIds) {
        const selected = await media.findById(mediaId);
        if (!selected || selected.ownerId !== input.authorId) throw new MediaNotFoundError();
        if (selected.kind !== (input.kind === 'reel' ? 'video' : 'image'))
          throw new MediaKindMismatchError();
      }
      if (input.kind === 'reel' && input.mediaIds.length !== 1) throw new MediaKindMismatchError();
      for (const mediaId of input.mediaIds) {
        await attachMediaOrThrow(media, { id: mediaId, ownerId: input.authorId, purpose: 'post' });
      }
      const id = this.ids.next();
      await posts.create({
        id,
        authorId: input.authorId,
        kind: input.kind,
        caption,
        mediaIds: input.mediaIds,
        createdAt: this.clock.now(),
      });
      await posts.incrementPostCount(input.authorId);

      const notifications = await writeTextMentions(
        {
          text: caption,
          authorId: input.authorId,
          contentAuthor: author,
          postId: id,
          target: { postId: id },
        },
        scope,
      );
      const post = await reader.findById(id, input.authorId);
      if (!post) throw new Error('Post créé introuvable dans sa transaction');
      return { created: post, notifications };
    });
    if (notifications.length) this.notifications.dispatch(notifications);
    // Après la validation de la transaction (ADR-013).
    this.analytics.track(input.authorId, {
      name: 'post_created',
      properties: { kind: created.kind, media_count: created.media.length },
    });
    return created;
  }
}

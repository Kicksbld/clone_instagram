import type { Clock } from '../../../../shared/application/clock.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
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
 * jamais utilisé. Dans une transaction : post, rattachement des médias et `post_count`.
 */
export class CreatePost {
  constructor(
    private readonly transaction: UnitOfWork<CreatePostTransaction>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreatePostInput): Promise<Post> {
    const caption = normalizeCaption(input.caption);

    return this.transaction.run(async ({ accounts, media, posts, reader }) => {
      if (!(await accounts.findById(input.authorId))) throw new ProfileNotFoundError();

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

      const post = await reader.findById(id);
      if (!post) throw new Error('Post créé introuvable dans sa transaction');
      return post;
    });
  }
}

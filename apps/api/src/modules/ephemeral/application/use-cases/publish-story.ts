import type { Clock } from '../../../../shared/application/clock.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { ProfileNotFoundError } from '../../../identity/domain/errors.ts';
import { attachMediaOrThrow } from '../../../media/application/attach-media.ts';
import { MediaKindMismatchError, MediaNotFoundError } from '../../../media/domain/errors.ts';
import { type Story, type StoryAudience, storyExpiresAt } from '../../domain/story.ts';
import type { PlusStatus } from '../ports/plus-status.ts';
import type { PublishStoryTransaction } from '../ports/story-transactions.ts';

/**
 * Publier une story photo (ADR-025) : image `ready`, à l'auteur, de `purpose` `story`, jamais utilisée,
 * rattachée dans la transaction (ADR-008). Expire après 24 h, ou 48 h si l'auteur est Plus à cet
 * instant ; la durée ne change plus ensuite (ADR-012).
 */
export class PublishStory {
  constructor(
    private readonly transaction: UnitOfWork<PublishStoryTransaction>,
    private readonly plus: PlusStatus,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    authorId: string;
    mediaId: string;
    audience: StoryAudience;
  }): Promise<Story> {
    const authorIsPlus = await this.plus.isPlus(input.authorId);

    return this.transaction.run(async ({ accounts, media, stories, reader }) => {
      if (!(await accounts.findById(input.authorId))) throw new ProfileNotFoundError();
      const selected = await media.findById(input.mediaId);
      if (!selected || selected.ownerId !== input.authorId) throw new MediaNotFoundError();
      if (selected.kind !== 'image') throw new MediaKindMismatchError();
      await attachMediaOrThrow(media, {
        id: input.mediaId,
        ownerId: input.authorId,
        purpose: 'story',
      });

      const id = this.ids.next();
      const createdAt = this.clock.now();
      await stories.create({
        id,
        authorId: input.authorId,
        mediaId: input.mediaId,
        audience: input.audience,
        createdAt,
        expiresAt: storyExpiresAt(createdAt, authorIsPlus),
      });
      const story = await reader.findActive(id, input.authorId, createdAt);
      if (!story) throw new Error('Story créée introuvable dans sa transaction');
      return story;
    });
  }
}

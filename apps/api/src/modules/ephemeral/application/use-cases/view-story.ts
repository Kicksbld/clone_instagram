import type { Clock } from '../../../../shared/application/clock.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewStory } from '../../../../shared/domain/visibility.ts';
import { StoryNotFoundError } from '../../domain/errors.ts';
import type { ViewStoryTransaction } from '../ports/story-transactions.ts';

/**
 * Vue d'une story à son affichage (ADR-025) : une par compte, idempotente ; `view_count` n'augmente
 * qu'à la création de la ligne, dans la même transaction. L'auteur n'est pas compté. Story supprimée,
 * expirée ou invisible (`canViewStory`) → `story_not_found`.
 */
export class ViewStory {
  constructor(
    private readonly transaction: UnitOfWork<ViewStoryTransaction>,
    private readonly clock: Clock,
  ) {}

  execute(input: { viewerId: string; storyId: string }): Promise<void> {
    const now = this.clock.now();
    return this.transaction.run(async ({ relationships, reader, stories }) => {
      const story = await reader.findActive(input.storyId, input.viewerId, now);
      if (!story) throw new StoryNotFoundError();
      if (story.author.id === input.viewerId) return;

      const relation = await relationships.between(input.viewerId, story.author.id);
      if (!canViewStory(input.viewerId, story, relation)) throw new StoryNotFoundError();

      if (await stories.recordView(story.id, input.viewerId, now)) {
        await stories.incrementViewCount(story.id);
      }
    });
  }
}

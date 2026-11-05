import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { normalizeAltText } from '../../../../shared/domain/alt-text.ts';
import { StoryNotFoundError } from '../../domain/errors.ts';
import type { Story } from '../../domain/story.ts';
import type { StoryReader, StoryRepository } from '../ports/story-repository.ts';

/** Auteur uniquement, même après expiration ; la modification et la relecture sont atomiques. */
export class UpdateStoryDescription {
  constructor(
    private readonly transaction: UnitOfWork<{ stories: StoryRepository; reader: StoryReader }>,
  ) {}

  execute(input: { authorId: string; storyId: string; altText: string }): Promise<Story> {
    const altText = normalizeAltText(input.altText);
    return this.transaction.run(async ({ stories, reader }) => {
      if (!(await stories.updateDescription(input.storyId, input.authorId, altText)))
        throw new StoryNotFoundError();
      const story = await reader.findOwned(input.storyId, input.authorId);
      if (!story) throw new StoryNotFoundError();
      return story;
    });
  }
}

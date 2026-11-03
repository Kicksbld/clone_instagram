import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import { canViewStory, SELF_RELATIONSHIP } from '../../../../shared/domain/visibility.ts';
import { PlusRequiredError } from '../../../billing/domain/subscription.ts';
import { StoryNotFoundError } from '../../domain/errors.ts';
import type { StoryViewer } from '../../domain/story.ts';
import type { PlusStatus } from '../ports/plus-status.ts';
import type { StoryReader } from '../ports/story-repository.ts';

export class ListStoryViewers {
  constructor(
    private readonly reader: StoryReader,
    private readonly plus: PlusStatus,
  ) {}

  async execute(input: {
    viewerId: string;
    storyId: string;
    after: PageCursor | null;
    q?: string;
  }): Promise<Page<StoryViewer>> {
    const story = await this.reader.findOwned(input.storyId, input.viewerId);
    if (!story || !canViewStory(input.viewerId, story, SELF_RELATIONSHIP))
      throw new StoryNotFoundError();
    if (input.q !== undefined && !(await this.plus.isPlus(input.viewerId)))
      throw new PlusRequiredError();
    return this.reader.listViewers({
      storyId: story.id,
      authorId: input.viewerId,
      after: input.after,
      ...(input.q !== undefined && { q: input.q }),
      limit: 20,
    });
  }
}

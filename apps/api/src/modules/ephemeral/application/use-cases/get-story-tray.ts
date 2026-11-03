import type { Clock } from '../../../../shared/application/clock.ts';
import { STORY_TRAY_LIMIT, type StoryTrayEntry } from '../../domain/story.ts';
import type { StoryReader } from '../ports/story-repository.ts';

/**
 * Bandeau des stories (ADR-025) : moi et les comptes suivis ayant une story active visible
 * (`canViewStory`, traduit en SQL par l'adapter, ADR-006), dans l'ordre du bandeau.
 */
export class GetStoryTray {
  constructor(
    private readonly stories: StoryReader,
    private readonly clock: Clock,
  ) {}

  execute(input: { viewerId: string }): Promise<StoryTrayEntry[]> {
    return this.stories.tray(input.viewerId, this.clock.now(), STORY_TRAY_LIMIT);
  }
}

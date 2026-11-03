import type { Clock } from '../../../../shared/application/clock.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Story } from '../../domain/story.ts';
import type { StoryReader } from '../ports/story-repository.ts';

/** L’archive est privée : le lecteur ne reçoit que l’identifiant de l’appelant authentifié. */
export class ListArchivedStories {
  constructor(
    private readonly reader: StoryReader,
    private readonly clock: Clock,
  ) {}

  execute(input: { viewerId: string; after: PageCursor | null }): Promise<Page<Story>> {
    return this.reader.listArchived({
      authorId: input.viewerId,
      now: this.clock.now(),
      after: input.after,
      limit: 20,
    });
  }
}

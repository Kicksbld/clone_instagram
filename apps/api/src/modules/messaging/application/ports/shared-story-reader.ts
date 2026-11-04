import type { StoryAudience, VisibilitySubject } from '../../../../shared/domain/visibility.ts';
import type { SharedStory } from '../../domain/conversation.ts';

/** Messaging's own read model of a referenced story (ADR-025). */
export interface SharedStoryReader {
  find(id: string): Promise<{
    owner: VisibilitySubject;
    audience: StoryAudience;
    preview: SharedStory;
  } | null>;
}

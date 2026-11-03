import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { StoryReader, StoryRepository } from './story-repository.ts';

/** Publication : story et rattachement du média (ADR-005, ADR-008). */
export interface PublishStoryTransaction {
  accounts: AccountReader;
  media: MediaRepository;
  stories: StoryRepository;
  reader: StoryReader;
}

/** Suppression : story et média détaché. */
export interface DeleteStoryTransaction {
  media: MediaRepository;
  stories: StoryRepository;
}

/** Vue : visibilité, ligne `story_views` et `view_count` dans une transaction. */
export interface ViewStoryTransaction {
  relationships: RelationshipReader;
  reader: StoryReader;
  stories: StoryRepository;
}

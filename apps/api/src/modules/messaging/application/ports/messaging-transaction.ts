import type { MessagingRepository } from './messaging-repository.ts';
import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
export interface MessagingScope {
  repository: MessagingRepository;
  relationships: RelationshipReader;
  /** Photo attached to an `image` message in the same transaction (ADR-008). */
  media: MediaRepository;
}

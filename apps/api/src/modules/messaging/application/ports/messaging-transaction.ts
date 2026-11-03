import type { MessagingRepository } from './messaging-repository.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
export interface MessagingScope {
  repository: MessagingRepository;
  relationships: RelationshipReader;
}

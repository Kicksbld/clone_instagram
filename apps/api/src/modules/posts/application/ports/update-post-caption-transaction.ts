import type { MentionWriter } from '../../../../shared/application/mention-writer.ts';
import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { PostReader, PostRepository } from './post-repository.ts';

/** Repositories d'une modification de légende : post + mentions + notifications (ADR-005). */
export interface UpdatePostCaptionTransaction {
  notifications: NotificationWriter;
  relationships: RelationshipReader;
  mentions: MentionWriter;
  posts: PostRepository;
  reader: PostReader;
}

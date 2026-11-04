import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { MentionWriter } from '../../../../shared/application/mention-writer.ts';
import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { PostReader, PostRepository } from './post-repository.ts';

/** Repositories d'une publication : post + médias rattachés + compteur (ADR-005). */
export interface CreatePostTransaction {
  notifications: NotificationWriter;
  relationships: RelationshipReader;
  mentions: MentionWriter;
  accounts: AccountReader;
  media: MediaRepository;
  posts: PostRepository;
  reader: PostReader;
}

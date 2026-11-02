import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { CommentReader, CommentRepository } from './comment-repository.ts';
import type { LikeablePostReader } from './like-repository.ts';

/** Repositories d'une transaction de commentaire : ligne, compteurs et notification (ADR-005, ADR-026). */
export interface CommentTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  posts: LikeablePostReader;
  comments: CommentRepository;
  reader: CommentReader;
  notifications: NotificationWriter;
}

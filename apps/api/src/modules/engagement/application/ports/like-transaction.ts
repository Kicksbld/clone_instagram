import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { LikeablePostReader, LikeRepository } from './like-repository.ts';

/** Repositories d'une transaction de like / unlike : ligne, compteur et notification (ADR-005, ADR-026). */
export interface LikeTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  posts: LikeablePostReader;
  likes: LikeRepository;
  notifications: NotificationWriter;
}

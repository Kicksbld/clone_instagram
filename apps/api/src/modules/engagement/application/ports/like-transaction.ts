import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { LikeablePostReader, LikeRepository } from './like-repository.ts';

/** Repositories d'une transaction de like / unlike : ligne + compteur (ADR-005). */
export interface LikeTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  posts: LikeablePostReader;
  likes: LikeRepository;
}

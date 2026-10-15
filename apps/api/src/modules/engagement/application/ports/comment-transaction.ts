import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { CommentReader, CommentRepository } from './comment-repository.ts';
import type { LikeablePostReader } from './like-repository.ts';

/** Repositories d'une transaction de commentaire : ligne + compteurs (ADR-005). */
export interface CommentTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  posts: LikeablePostReader;
  comments: CommentRepository;
  reader: CommentReader;
}

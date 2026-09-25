import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from './account-reader.ts';
import type { FollowCounters, FollowRepository } from './follow-repository.ts';

/** Repositories d'une transaction de follow / unfollow : ligne + compteurs (ADR-005). */
export interface FollowTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  follows: FollowRepository;
  counters: FollowCounters;
}

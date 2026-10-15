import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from './account-reader.ts';
import type { BlockRepository } from './block-repository.ts';
import type { FollowCounters, FollowRepository } from './follow-repository.ts';

/**
 * Repositories d'une transaction de blocage : le blocage, les abonnements supprimés dans les deux
 * sens et leurs compteurs (ADR-005, ADR-006).
 */
export interface BlockTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  blocks: BlockRepository;
  follows: FollowRepository;
  counters: FollowCounters;
}

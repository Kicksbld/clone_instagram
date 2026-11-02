import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from './account-reader.ts';
import type { BlockRepository } from './block-repository.ts';
import type { FollowCounters, FollowRepository } from './follow-repository.ts';
import type { FollowRequestRepository } from './follow-request-repository.ts';

/**
 * Repositories d'une transaction de blocage : le blocage, les abonnements et les demandes
 * d'abonnement supprimés dans les deux sens, leurs compteurs et leurs notifications (ADR-005,
 * ADR-006, ADR-026).
 */
export interface BlockTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  blocks: BlockRepository;
  follows: FollowRepository;
  requests: FollowRequestRepository;
  counters: FollowCounters;
  notifications: NotificationWriter;
}

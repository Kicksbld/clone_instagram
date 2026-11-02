import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from './account-reader.ts';
import type { FollowCounters, FollowRepository } from './follow-repository.ts';
import type { FollowRequestRepository } from './follow-request-repository.ts';

/**
 * Repositories d'une transaction d'abonnement (suivre, ne plus suivre, demande d'abonnement, retrait
 * d'un abonné) : lignes, compteurs et notifications (ADR-005, ADR-026).
 */
export interface FollowTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  follows: FollowRepository;
  requests: FollowRequestRepository;
  counters: FollowCounters;
  notifications: NotificationWriter;
}

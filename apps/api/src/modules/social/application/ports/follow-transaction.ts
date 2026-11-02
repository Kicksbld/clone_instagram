import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from './account-reader.ts';
import type { FollowCounters, FollowRepository } from './follow-repository.ts';

/** Repositories d'une transaction de follow / unfollow : ligne, compteurs et notification (ADR-005, ADR-026). */
export interface FollowTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  follows: FollowRepository;
  counters: FollowCounters;
  notifications: NotificationWriter;
}

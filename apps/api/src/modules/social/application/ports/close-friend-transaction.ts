import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { AccountReader } from './account-reader.ts';
import type { CloseFriendRepository } from './close-friend-repository.ts';

/**
 * Repositories d'un ajout aux amis proches : la visibilité du compte est lue dans la même transaction
 * que l'écriture, pour qu'un blocage concurrent ne laisse pas d'ami proche derrière lui (ADR-006).
 */
export interface CloseFriendTransaction {
  accounts: AccountReader;
  relationships: RelationshipReader;
  closeFriends: CloseFriendRepository;
}

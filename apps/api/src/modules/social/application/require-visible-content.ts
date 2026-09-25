import type { RelationshipReader } from '../../../shared/application/relationship-reader.ts';
import { canViewContent, SELF_RELATIONSHIP } from '../../../shared/domain/visibility.ts';
import { UserNotFoundError } from '../../identity/domain/errors.ts';
import type { AccountReader } from './ports/account-reader.ts';

/**
 * Les listes d'abonnés et d'abonnements sont réservées à qui peut voir les contenus du compte
 * (`canViewContent`, ADR-006) ; sinon `user_not_found`, jamais 403.
 */
export async function requireVisibleContent(
  accounts: AccountReader,
  relationships: RelationshipReader,
  viewerId: string,
  ownerId: string,
): Promise<void> {
  const owner = await accounts.findById(ownerId);
  if (!owner) throw new UserNotFoundError();
  const relation =
    owner.id === viewerId ? SELF_RELATIONSHIP : await relationships.between(viewerId, owner.id);
  if (!canViewContent(viewerId, owner, relation)) throw new UserNotFoundError();
}

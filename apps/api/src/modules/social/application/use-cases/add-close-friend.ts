import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { ProfileNotFoundError, UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotCloseFriendSelfError } from '../../domain/errors.ts';
import type { CloseFriendTransaction } from '../ports/close-friend-transaction.ts';

/**
 * Ajouter un compte à mes amis proches (ADR-006), sans notification. Seul un compte visible
 * (`canViewProfile`) peut être ajouté : compte bloqué dans un sens ou dans l'autre, inexistant ou non
 * actif → `user_not_found`. Idempotent : un compte déjà dans la liste ne change rien.
 */
export class AddCloseFriend {
  constructor(private readonly transaction: UnitOfWork<CloseFriendTransaction>) {}

  execute(input: { viewerId: string; userId: string }): Promise<void> {
    const { viewerId, userId } = input;
    if (viewerId === userId) return Promise.reject(new CannotCloseFriendSelfError());

    return this.transaction.run(async ({ accounts, relationships, closeFriends }) => {
      if (!(await accounts.findById(viewerId))) throw new ProfileNotFoundError();
      const friend = await accounts.findById(userId);
      if (!friend) throw new UserNotFoundError();
      const relation = await relationships.between(viewerId, friend.id);
      if (!canViewProfile(viewerId, friend, relation)) throw new UserNotFoundError();
      await closeFriends.add(viewerId, friend.id);
    });
  }
}

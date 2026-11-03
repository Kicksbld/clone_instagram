import { UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotCloseFriendSelfError } from '../../domain/errors.ts';
import type { AccountReader } from '../ports/account-reader.ts';
import type { CloseFriendRepository } from '../ports/close-friend-repository.ts';

/**
 * Retirer un compte de mes amis proches, sans le prévenir : il perd aussitôt l'accès à mes contenus
 * réservés aux amis proches (appliqué par la politique de visibilité, ADR-006). Idempotent : un compte
 * absent de la liste ne change rien.
 */
export class RemoveCloseFriend {
  constructor(
    private readonly accounts: AccountReader,
    private readonly closeFriends: CloseFriendRepository,
  ) {}

  async execute(input: { viewerId: string; userId: string }): Promise<void> {
    const { viewerId, userId } = input;
    if (viewerId === userId) throw new CannotCloseFriendSelfError();
    if (!(await this.accounts.findById(userId))) throw new UserNotFoundError();
    await this.closeFriends.remove(viewerId, userId);
  }
}

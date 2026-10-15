import { UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotBlockSelfError } from '../../domain/errors.ts';
import type { AccountReader } from '../ports/account-reader.ts';
import type { BlockRepository } from '../ports/block-repository.ts';

/**
 * Débloquer un compte. Idempotent : sans blocage, ne change rien. Les abonnements supprimés au
 * blocage ne sont pas rétablis.
 */
export class UnblockUser {
  constructor(
    private readonly accounts: AccountReader,
    private readonly blocks: BlockRepository,
  ) {}

  async execute(input: { viewerId: string; userId: string }): Promise<void> {
    const { viewerId, userId } = input;
    if (viewerId === userId) throw new CannotBlockSelfError();
    if (!(await this.accounts.findById(userId))) throw new UserNotFoundError();
    await this.blocks.remove(viewerId, userId);
  }
}

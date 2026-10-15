import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { canViewProfile } from '../../../../shared/domain/visibility.ts';
import { ProfileNotFoundError, UserNotFoundError } from '../../../identity/domain/errors.ts';
import { CannotBlockSelfError } from '../../domain/errors.ts';
import type { BlockTransaction } from '../ports/block-transaction.ts';

/**
 * Bloquer un compte (ADR-006) : les abonnements sont supprimés dans les deux sens, compteurs compris,
 * dans la même transaction ; les deux comptes deviennent ensuite mutuellement invisibles. Idempotent :
 * un compte déjà bloqué ne change rien. Compte qui m'a bloqué ou non actif : invisible, donc 404.
 */
export class BlockUser {
  constructor(private readonly transaction: UnitOfWork<BlockTransaction>) {}

  execute(input: { viewerId: string; userId: string }): Promise<void> {
    const { viewerId, userId } = input;
    if (viewerId === userId) return Promise.reject(new CannotBlockSelfError());

    return this.transaction.run(async ({ accounts, relationships, blocks, follows, counters }) => {
      if (!(await accounts.findById(viewerId))) throw new ProfileNotFoundError();
      const target = await accounts.findById(userId);
      if (!target) throw new UserNotFoundError();
      if (await blocks.has(viewerId, target.id)) return;
      const relation = await relationships.between(viewerId, target.id);
      if (!canViewProfile(viewerId, target, relation)) throw new UserNotFoundError();

      await blocks.add(viewerId, target.id);
      if (await follows.remove(viewerId, target.id)) await counters.apply(viewerId, target.id, -1);
      if (await follows.remove(target.id, viewerId)) await counters.apply(target.id, viewerId, -1);
    });
  }
}

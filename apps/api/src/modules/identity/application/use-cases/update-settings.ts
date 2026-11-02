import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { ProfileNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { SettingsTransaction } from '../ports/settings-transaction.ts';

/**
 * Passe mon compte en privé ou en public (ADR-006). Passer en privé conserve mes abonnés. Passer en
 * public accepte toutes les demandes d'abonnement en attente dans la même transaction, compteurs et
 * notifications compris (ADR-026) ; les notifications sont diffusées après elle.
 */
export class UpdateSettings {
  constructor(
    private readonly transaction: UnitOfWork<SettingsTransaction>,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: { userId: string; isPrivate: boolean }): Promise<Profile> {
    const { profile, created } = await this.transaction.run(async (scope) => {
      // Profil modifié d'abord : sa ligne reste verrouillée jusqu'à la fin de la transaction.
      const updated = await scope.profiles.update(input.userId, { isPrivate: input.isPrivate });
      if (!updated) throw new ProfileNotFoundError();
      if (input.isPrivate) return { profile: updated, created: [] };

      const created = await scope.followRequests.acceptAll(input.userId);
      // Compteur d'abonnés relu après les acceptations.
      return { profile: (await scope.profiles.findById(input.userId)) ?? updated, created };
    });
    if (created.length > 0) this.notifications.dispatch(created);
    return profile;
  }
}

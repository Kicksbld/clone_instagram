import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { EmptySettingsError, ProfileNotFoundError } from '../../domain/errors.ts';
import type { FriendsTabActivity, Profile } from '../../domain/profile.ts';
import type { SettingsTransaction } from '../ports/settings-transaction.ts';

/**
 * Modifie mes paramètres ; seuls les champs présents changent (le contrat en exige au moins un).
 * Compte privé ou public (ADR-006) : passer en privé conserve mes abonnés ; passer en public accepte
 * toutes les demandes d'abonnement en attente dans la même transaction, compteurs et notifications
 * compris (ADR-026), notifications diffusées après elle. Activité dans l'onglet Amis (ADR-029).
 */
export class UpdateSettings {
  constructor(
    private readonly transaction: UnitOfWork<SettingsTransaction>,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: {
    userId: string;
    isPrivate?: boolean;
    friendsTabActivity?: FriendsTabActivity;
  }): Promise<Profile> {
    if (input.isPrivate === undefined && input.friendsTabActivity === undefined) {
      throw new EmptySettingsError();
    }
    const { profile, created } = await this.transaction.run(async (scope) => {
      // Profil modifié d'abord : sa ligne reste verrouillée jusqu'à la fin de la transaction.
      const updated = await scope.profiles.update(input.userId, {
        ...(input.isPrivate !== undefined && { isPrivate: input.isPrivate }),
        ...(input.friendsTabActivity && { friendsTabActivity: input.friendsTabActivity }),
      });
      if (!updated) throw new ProfileNotFoundError();
      if (input.isPrivate !== false) return { profile: updated, created: [] };

      const created = await scope.followRequests.acceptAll(input.userId);
      // Compteur d'abonnés relu après les acceptations.
      return { profile: (await scope.profiles.findById(input.userId)) ?? updated, created };
    });
    if (created.length > 0) this.notifications.dispatch(created);
    return profile;
  }
}

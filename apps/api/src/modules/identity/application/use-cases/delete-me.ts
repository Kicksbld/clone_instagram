import type { JobQueue } from '../../../../shared/application/job-queue.ts';
import { ProfileNotFoundError } from '../../domain/errors.ts';
import type { AuthAccounts } from '../ports/auth-accounts.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

/**
 * Supprime mon compte (T13), y compris suspendu ou banni (ADR-005). L'accès est coupé tout de suite :
 * utilisateur Supabase Auth supprimé (plus de rafraîchissement de jeton), puis profil `deleted`
 * (invisible, et tout JWT encore valide refusé par la vérification d'authentification). Le job
 * `purge-account` efface ensuite données, fichiers, client RevenueCat et personne PostHog (ADR-008).
 *
 * Supabase Auth en premier : s'il échoue, rien n'a changé et l'app peut réessayer.
 */
export class DeleteMe {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly authAccounts: AuthAccounts,
    private readonly jobs: JobQueue,
  ) {}

  async execute(input: { userId: string }): Promise<void> {
    const profile = await this.profiles.findById(input.userId);
    if (!profile) throw new ProfileNotFoundError();

    await this.authAccounts.deleteUser(input.userId);
    await this.profiles.markDeleted(input.userId);
    await this.jobs.enqueueAccountPurge(input.userId);
  }
}

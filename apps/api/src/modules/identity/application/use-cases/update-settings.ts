import { ProfileNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

/**
 * Passe mon compte en privé ou en public (ADR-006). Passer en privé conserve mes abonnés ; les
 * demandes d'abonnement, et leur acceptation au passage en public, arrivent en P1.
 */
export class UpdateSettings {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: { userId: string; isPrivate: boolean }): Promise<Profile> {
    const profile = await this.profiles.update(input.userId, { isPrivate: input.isPrivate });
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }
}

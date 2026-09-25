import { ProfileNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

/** Mon profil ; `profile_not_found` tant que l'onboarding n'est pas terminé (ADR-004). */
export class GetMe {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: { userId: string }): Promise<Profile> {
    const profile = await this.profiles.findById(input.userId);
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }
}

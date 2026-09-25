import type { Clock } from '../../../../shared/application/clock.ts';
import { isOldEnough } from '../../domain/age.ts';
import { AgeRequirementNotMetError, ProfileAlreadyExistsError } from '../../domain/errors.ts';
import { normalizeFullName, type Profile } from '../../domain/profile.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

export interface CompleteOnboardingInput {
  userId: string;
  username: string;
  fullName: string;
  birthDate: string;
}

/** Crée le profil à l'acceptation des conditions (ADR-018). */
export class CompleteOnboarding {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CompleteOnboardingInput): Promise<Profile> {
    if (await this.profiles.findById(input.userId)) throw new ProfileAlreadyExistsError();
    if (!isOldEnough(input.birthDate, this.clock.now())) throw new AgeRequirementNotMetError();

    // Username pris, y compris par une inscription simultanée : contrainte d'unicité (adapter).
    return this.profiles.create({
      id: input.userId,
      username: input.username,
      fullName: normalizeFullName(input.fullName),
      birthDate: input.birthDate,
    });
  }
}

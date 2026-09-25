import { ProfileNotFoundError } from '../../domain/errors.ts';
import { normalizeBio, normalizeFullName, type Profile } from '../../domain/profile.ts';
import type { ProfileChanges, ProfileRepository } from '../ports/profile-repository.ts';

export interface UpdateMeInput {
  userId: string;
  changes: ProfileChanges;
}

/** Modifie mon nom, ma bio ou mon username ; seuls les champs fournis changent. */
export class UpdateMe {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: UpdateMeInput): Promise<Profile> {
    const { username, fullName, bio } = input.changes;
    const changes: ProfileChanges = {
      ...(username !== undefined && { username }),
      ...(fullName !== undefined && { fullName: normalizeFullName(fullName) }),
      ...(bio !== undefined && { bio: normalizeBio(bio) }),
    };

    const profile = await this.profiles.update(input.userId, changes);
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }
}

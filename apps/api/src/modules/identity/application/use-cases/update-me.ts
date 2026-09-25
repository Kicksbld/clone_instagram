import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { attachMediaOrThrow } from '../../../media/application/attach-media.ts';
import { ProfileNotFoundError } from '../../domain/errors.ts';
import { normalizeBio, normalizeFullName, type Profile } from '../../domain/profile.ts';
import type { AvatarTransaction } from '../ports/avatar-transaction.ts';
import type { ProfileChanges, ProfileRepository } from '../ports/profile-repository.ts';

export interface UpdateMeInput {
  userId: string;
  changes: Omit<ProfileChanges, 'avatarMediaId'> & { avatarMediaId?: string };
}

/**
 * Modifie mon nom, ma bio, mon username ou ma photo ; seuls les champs fournis changent.
 * Nouvelle photo : dans une transaction, le média est attaché, l'ancien détaché (puis purgé, ADR-008).
 */
export class UpdateMe {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly transaction: UnitOfWork<AvatarTransaction>,
  ) {}

  async execute(input: UpdateMeInput): Promise<Profile> {
    const { username, fullName, bio, avatarMediaId } = input.changes;
    const changes: ProfileChanges = {
      ...(username !== undefined && { username }),
      ...(fullName !== undefined && { fullName: normalizeFullName(fullName) }),
      ...(bio !== undefined && { bio: normalizeBio(bio) }),
    };

    if (avatarMediaId === undefined) return this.update(this.profiles, input.userId, changes);

    return this.transaction.run(async ({ profiles, media }) => {
      const current = await profiles.findById(input.userId);
      if (!current) throw new ProfileNotFoundError();
      if (current.avatar?.mediaId === avatarMediaId) {
        return this.update(profiles, input.userId, changes);
      }

      await attachMediaOrThrow(media, {
        id: avatarMediaId,
        ownerId: input.userId,
        purpose: 'avatar',
      });
      if (current.avatar) await media.detach(current.avatar.mediaId);
      return this.update(profiles, input.userId, { ...changes, avatarMediaId });
    });
  }

  private async update(
    profiles: ProfileRepository,
    userId: string,
    changes: ProfileChanges,
  ): Promise<Profile> {
    const profile = await profiles.update(userId, changes);
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }
}

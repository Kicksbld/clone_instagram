import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { ProfileNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { AvatarTransaction } from '../ports/avatar-transaction.ts';

/** Retire ma photo de profil : le média est détaché (puis purgé, ADR-008). Sans photo, ne change rien. */
export class RemoveAvatar {
  constructor(private readonly transaction: UnitOfWork<AvatarTransaction>) {}

  execute(input: { userId: string }): Promise<Profile> {
    return this.transaction.run(async ({ profiles, media }) => {
      const current = await profiles.findById(input.userId);
      if (!current) throw new ProfileNotFoundError();
      if (!current.avatar) return current;

      await media.detach(current.avatar.mediaId);
      const updated = await profiles.update(input.userId, { avatarMediaId: null });
      if (!updated) throw new ProfileNotFoundError();
      return updated;
    });
  }
}

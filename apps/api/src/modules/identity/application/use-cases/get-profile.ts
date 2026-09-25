import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import {
  canViewContent,
  canViewProfile,
  SELF_RELATIONSHIP,
} from '../../../../shared/domain/visibility.ts';
import { UserNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

/** Profil d'un utilisateur vu par l'appelant : relation et droit de voir ses contenus. */
export interface ProfileView {
  profile: Profile;
  relationship: { following: boolean; followedBy: boolean };
  canViewContent: boolean;
}

/**
 * Profil d'un utilisateur par son username (ADR-006) : inexistant, bloqué dans un sens ou dans
 * l'autre, ou compte non actif → `user_not_found`. Compte privé non suivi : en-tête visible.
 */
export class GetProfile {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly relationships: RelationshipReader,
  ) {}

  async execute(input: { viewerId: string; username: string }): Promise<ProfileView> {
    const profile = await this.profiles.findByUsername(input.username);
    if (!profile) throw new UserNotFoundError();

    const relation =
      profile.id === input.viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(input.viewerId, profile.id);
    if (!canViewProfile(input.viewerId, profile, relation)) throw new UserNotFoundError();

    return {
      profile,
      relationship: {
        following: relation.viewerFollowsOwner,
        followedBy: relation.ownerFollowsViewer,
      },
      canViewContent: canViewContent(input.viewerId, profile, relation),
    };
  }
}

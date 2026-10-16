import type { components } from '@clone/contract';

import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import { UserNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';

export type AdminUserSummary = components['schemas']['AdminUserSummary'];

/** Compte vu par un admin (fiche, recherche, signalement d'un compte). */
export function toAdminUserSummary(profile: Profile, urls: PublicMediaUrls): AdminUserSummary {
  // Un compte supprimé n'est jamais renvoyé (les use cases le traitent comme introuvable).
  if (profile.status === 'deleted') throw new UserNotFoundError();
  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.fullName,
    status: profile.status,
    ...(profile.avatar && { avatar: urls.of(profile.avatar.variants) }),
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    postCount: profile.postCount,
    createdAt: profile.createdAt.toISOString(),
  };
}

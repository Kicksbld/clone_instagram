import type { MediaRepository } from '../../../media/application/ports/media-repository.ts';
import type { ProfileRepository } from './profile-repository.ts';

/** Repositories d'une transaction qui change la photo de profil (profil + médias, ADR-005). */
export interface AvatarTransaction {
  profiles: ProfileRepository;
  media: MediaRepository;
}

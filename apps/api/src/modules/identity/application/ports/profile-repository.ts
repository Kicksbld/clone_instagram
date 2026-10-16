import type { Profile } from '../../domain/profile.ts';

export interface NewProfile {
  id: string;
  username: string;
  fullName: string;
  birthDate: string;
}

export interface ProfileChanges {
  username?: string;
  fullName?: string;
  bio?: string;
  isPrivate?: boolean;
  /** `null` retire la photo ; le média doit avoir été attaché dans la même transaction. */
  avatarMediaId?: string | null;
}

export interface ProfileRepository {
  findById(id: string): Promise<Profile | null>;
  findByUsername(username: string): Promise<Profile | null>;
  /** Lève `ProfileAlreadyExistsError` ou `UsernameTakenError` (contraintes d'unicité). */
  create(profile: NewProfile): Promise<Profile>;
  /** `null` si le profil n'existe pas ; lève `UsernameTakenError`. */
  update(id: string, changes: ProfileChanges): Promise<Profile | null>;
  /** Passe le profil en `deleted` (suppression du compte, T13) ; la ligne est purgée par le worker. */
  markDeleted(id: string): Promise<void>;
  /** Parmi `usernames`, ceux déjà utilisés par un profil autre que `exceptProfileId`. */
  findTakenUsernames(usernames: readonly string[], exceptProfileId: string): Promise<Set<string>>;
}

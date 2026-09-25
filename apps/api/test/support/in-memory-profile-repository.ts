import type {
  NewProfile,
  ProfileChanges,
  ProfileRepository,
} from '../../src/modules/identity/application/ports/profile-repository.ts';
import {
  ProfileAlreadyExistsError,
  UsernameTakenError,
} from '../../src/modules/identity/domain/errors.ts';
import type { Profile } from '../../src/modules/identity/domain/profile.ts';
import type { InMemoryMediaRepository } from './in-memory-media-repository.ts';

/**
 * Adapter en mémoire (ADR-005) : mêmes contraintes d'unicité que la table `profiles` ; la photo de
 * profil est lue dans `media`, comme la jointure de l'adapter Drizzle.
 */
export class InMemoryProfileRepository implements ProfileRepository {
  readonly rows = new Map<string, Profile>();
  media: InMemoryMediaRepository | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  add(profile: Partial<Profile> & Pick<Profile, 'id' | 'username'>): Profile {
    const row: Profile = {
      fullName: 'Test',
      bio: '',
      birthDate: '2000-01-01',
      isPrivate: false,
      status: 'active',
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      avatar: null,
      createdAt: this.now(),
      ...profile,
    };
    this.rows.set(row.id, row);
    return row;
  }

  findById(id: string): Promise<Profile | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  /** Photo de profil d'après `avatarMediaId`, avec les variantes du média. */
  private withAvatar(profile: Profile, avatarMediaId: string | null): Profile {
    const variants = avatarMediaId ? this.media?.rows.get(avatarMediaId)?.variants : null;
    return {
      ...profile,
      avatar: avatarMediaId && variants ? { mediaId: avatarMediaId, variants } : null,
    };
  }

  create(profile: NewProfile): Promise<Profile> {
    if (this.rows.has(profile.id)) return Promise.reject(new ProfileAlreadyExistsError());
    if (this.usernameTakenBy(profile.username, profile.id)) {
      return Promise.reject(new UsernameTakenError());
    }
    return Promise.resolve(this.add(profile));
  }

  update(id: string, changes: ProfileChanges): Promise<Profile | null> {
    const current = this.rows.get(id);
    if (!current) return Promise.resolve(null);
    if (changes.username !== undefined && this.usernameTakenBy(changes.username, id)) {
      return Promise.reject(new UsernameTakenError());
    }
    const { avatarMediaId, ...fields } = changes;
    const merged = { ...current, ...fields };
    const updated = avatarMediaId === undefined ? merged : this.withAvatar(merged, avatarMediaId);
    this.rows.set(id, updated);
    return Promise.resolve(updated);
  }

  findTakenUsernames(usernames: readonly string[], exceptProfileId: string): Promise<Set<string>> {
    return Promise.resolve(
      new Set(usernames.filter((username) => this.usernameTakenBy(username, exceptProfileId))),
    );
  }

  private usernameTakenBy(username: string, exceptProfileId: string): boolean {
    return [...this.rows.values()].some((p) => p.username === username && p.id !== exceptProfileId);
  }
}

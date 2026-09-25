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

/** Adapter en mémoire (ADR-005) : mêmes contraintes d'unicité que la table `profiles`. */
export class InMemoryProfileRepository implements ProfileRepository {
  readonly rows = new Map<string, Profile>();

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
      createdAt: this.now(),
      ...profile,
    };
    this.rows.set(row.id, row);
    return row;
  }

  findById(id: string): Promise<Profile | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
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
    const updated = { ...current, ...changes };
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

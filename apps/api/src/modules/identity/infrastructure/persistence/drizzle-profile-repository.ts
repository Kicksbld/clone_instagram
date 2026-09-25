import { media, profiles, type Executor, type ImageVariantPaths, type ProfileRow } from '@clone/db';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type {
  NewProfile,
  ProfileChanges,
  ProfileRepository,
} from '../../application/ports/profile-repository.ts';
import { ProfileAlreadyExistsError, UsernameTakenError } from '../../domain/errors.ts';
import type { Avatar, Profile } from '../../domain/profile.ts';

function toAvatar(mediaId: string | null, variants: ImageVariantPaths | null): Avatar | null {
  return mediaId && variants ? { mediaId, variants } : null;
}

function toProfile(row: ProfileRow, avatarVariants: ImageVariantPaths | null): Profile {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    bio: row.bio,
    birthDate: row.birthDate,
    isPrivate: row.isPrivate,
    status: row.status,
    followerCount: row.followerCount,
    followingCount: row.followingCount,
    postCount: row.postCount,
    avatar: toAvatar(row.avatarMediaId, avatarVariants),
    createdAt: row.createdAt,
  };
}

/** Nom de la contrainte d'unicité violée (erreur Postgres 23505), y compris enveloppée par Drizzle. */
function uniqueViolation(error: unknown): string | null {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if ('code' in current && current.code === '23505' && 'constraint_name' in current) {
      return String(current.constraint_name);
    }
  }
  return null;
}

function translateUniqueViolation(error: unknown): unknown {
  switch (uniqueViolation(error)) {
    case 'profiles_pkey':
      return new ProfileAlreadyExistsError();
    case 'profiles_username_key':
      return new UsernameTakenError();
    default:
      return error;
  }
}

/** Sur une connexion ou dans une transaction (`UnitOfWork`). */
export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Profile | null> {
    // Photo de profil : variantes du média attaché (toujours `ready`, ADR-008).
    const [row] = await this.db
      .select({ profile: profiles, avatarVariants: media.variants })
      .from(profiles)
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(eq(profiles.id, id))
      .limit(1);
    return row ? toProfile(row.profile, row.avatarVariants) : null;
  }

  async create(profile: NewProfile): Promise<Profile> {
    try {
      const [row] = await this.db.insert(profiles).values(profile).returning();
      if (!row) throw new Error('INSERT sans ligne renvoyée');
      return toProfile(row, null);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async update(id: string, changes: ProfileChanges): Promise<Profile | null> {
    try {
      const [row] = await this.db
        .update(profiles)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(profiles.id, id))
        .returning({ id: profiles.id });
      return row ? await this.findById(id) : null;
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async findTakenUsernames(
    usernames: readonly string[],
    exceptProfileId: string,
  ): Promise<Set<string>> {
    if (usernames.length === 0) return new Set();
    const rows = await this.db
      .select({ username: profiles.username })
      .from(profiles)
      .where(and(inArray(profiles.username, [...usernames]), ne(profiles.id, exceptProfileId)));
    return new Set(rows.map((row) => row.username));
  }
}

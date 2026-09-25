import { newId, profiles } from '@clone/db';
import { inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  ProfileAlreadyExistsError,
  UsernameTakenError,
} from '../../../src/modules/identity/domain/errors.ts';
import { DrizzleProfileRepository } from '../../../src/modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const repository = new DrizzleProfileRepository(database.db);
const created: string[] = [];

/** Identifiant et username uniques : les tests tournent sur la base de dev sans la vider. */
function newProfile(overrides: { username?: string } = {}) {
  const id = newId();
  created.push(id);
  const username = overrides.username ?? `t_${id.replaceAll('-', '').slice(-20)}`;
  return { id, username, fullName: 'Test', birthDate: '2000-01-31' };
}

afterEach(async () => {
  if (created.length > 0) {
    await database.db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
  }
});

afterAll(async () => {
  await database.close();
});

describe('DrizzleProfileRepository', () => {
  it('crée puis relit un profil avec les valeurs par défaut', async () => {
    const input = newProfile();
    const profile = await repository.create(input);

    expect(profile).toMatchObject({
      ...input,
      bio: '',
      isPrivate: false,
      status: 'active',
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
    });
    expect(profile.createdAt).toBeInstanceOf(Date);
    await expect(repository.findById(input.id)).resolves.toEqual(profile);
  });

  it('profil inconnu → null', async () => {
    await expect(repository.findById(newId())).resolves.toBeNull();
  });

  it('relit un profil par son username', async () => {
    const input = newProfile();
    const profile = await repository.create(input);

    await expect(repository.findByUsername(input.username)).resolves.toEqual(profile);
    await expect(repository.findByUsername(`${input.username}x`)).resolves.toBeNull();
  });

  it('même id → ProfileAlreadyExistsError', async () => {
    const input = newProfile();
    await repository.create(input);
    await expect(
      repository.create({ ...input, username: newProfile().username }),
    ).rejects.toBeInstanceOf(ProfileAlreadyExistsError);
  });

  it('même username → UsernameTakenError (contrainte d’unicité)', async () => {
    const first = newProfile();
    await repository.create(first);
    await expect(
      repository.create(newProfile({ username: first.username })),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('deux inscriptions simultanées sur le même username : une seule réussit', async () => {
    const username = newProfile().username;
    const results = await Promise.allSettled([
      repository.create(newProfile({ username })),
      repository.create(newProfile({ username })),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(UsernameTakenError);
  });

  it('met à jour les champs fournis et updated_at', async () => {
    const input = newProfile();
    await repository.create(input);

    const updated = await repository.update(input.id, { bio: 'Dev iOS', fullName: 'Nouveau' });

    expect(updated).toMatchObject({
      bio: 'Dev iOS',
      fullName: 'Nouveau',
      username: input.username,
    });
    const [row] = await database.db
      .select({ createdAt: profiles.createdAt, updatedAt: profiles.updatedAt })
      .from(profiles)
      .where(inArray(profiles.id, [input.id]));
    expect(row?.updatedAt.getTime()).toBeGreaterThanOrEqual(row?.createdAt.getTime() ?? 0);
  });

  it('update vers le username d’un autre → UsernameTakenError', async () => {
    const me = newProfile();
    const other = newProfile();
    await repository.create(me);
    await repository.create(other);

    await expect(repository.update(me.id, { username: other.username })).rejects.toBeInstanceOf(
      UsernameTakenError,
    );
  });

  it('update d’un profil inconnu → null', async () => {
    await expect(repository.update(newId(), { bio: 'x' })).resolves.toBeNull();
  });

  it('usernames pris, hors le profil exclu', async () => {
    const me = newProfile();
    const other = newProfile();
    await repository.create(me);
    await repository.create(other);

    const taken = await repository.findTakenUsernames(
      [me.username, other.username, 'libre_zz_zz'],
      me.id,
    );

    expect(taken).toEqual(new Set([other.username]));
  });

  it.each([
    ['username en majuscules', { username: 'Majuscule' }],
    ['nom de 31 caractères', { fullName: 'a'.repeat(31) }],
    ['nom fait d’espaces', { fullName: '   ' }],
  ])('contrainte CHECK : %s refusé par la base', async (_label, override) => {
    await expect(repository.create({ ...newProfile(), ...override })).rejects.toThrow();
  });

  it('contrainte CHECK : bio de 151 caractères refusée par la base', async () => {
    const input = newProfile();
    await repository.create(input);
    await expect(repository.update(input.id, { bio: 'a'.repeat(151) })).rejects.toThrow();
  });
});

describe('RLS (ADR-004)', () => {
  it('toutes les tables du schéma public ont RLS activé', async () => {
    const rows = await database.db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});

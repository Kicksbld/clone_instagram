import { blocks, follows, newId, profiles } from '@clone/db';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleRelationshipReader } from '../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { connectTestDatabase } from '../support/database.ts';

const database = connectTestDatabase();
const reader = new DrizzleRelationshipReader(database.db);
const created: string[] = [];

/** Profil unique : les tests tournent sur la base de dev sans la vider (suppression en cascade). */
async function newProfile(): Promise<string> {
  const id = newId();
  created.push(id);
  await database.db.insert(profiles).values({
    id,
    username: `t_${id.replaceAll('-', '').slice(-20)}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
  });
  return id;
}

afterEach(async () => {
  if (created.length > 0) {
    await database.db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
  }
});

afterAll(async () => {
  await database.close();
});

describe('DrizzleRelationshipReader', () => {
  it('aucune relation', async () => {
    const [viewer, owner] = [await newProfile(), await newProfile()];

    await expect(reader.between(viewer, owner)).resolves.toEqual({
      viewerFollowsOwner: false,
      ownerFollowsViewer: false,
      blocked: false,
      viewerIsCloseFriend: false,
    });
  });

  it('abonnements dans chaque sens', async () => {
    const [viewer, owner] = [await newProfile(), await newProfile()];
    await database.db.insert(follows).values({ followerId: viewer, followeeId: owner });

    await expect(reader.between(viewer, owner)).resolves.toMatchObject({
      viewerFollowsOwner: true,
      ownerFollowsViewer: false,
    });
    await expect(reader.between(owner, viewer)).resolves.toMatchObject({
      viewerFollowsOwner: false,
      ownerFollowsViewer: true,
    });
  });

  it('blocage vu des deux côtés', async () => {
    const [viewer, owner] = [await newProfile(), await newProfile()];
    await database.db.insert(blocks).values({ blockerId: owner, blockedId: viewer });

    await expect(reader.between(viewer, owner)).resolves.toMatchObject({ blocked: true });
    await expect(reader.between(owner, viewer)).resolves.toMatchObject({ blocked: true });
  });

  it('se suivre ou se bloquer soi-même est refusé par la base', async () => {
    const id = await newProfile();

    await expect(
      database.db.insert(follows).values({ followerId: id, followeeId: id }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(blocks).values({ blockerId: id, blockedId: id }),
    ).rejects.toThrow();
  });
});

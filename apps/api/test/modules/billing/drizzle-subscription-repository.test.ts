import { newId, profiles } from '@clone/db';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleSubscriptionRepository } from '../../../src/modules/billing/infrastructure/persistence/drizzle-subscription-repository.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const repository = new DrizzleSubscriptionRepository(database.db);
const created: string[] = [];

async function newProfile() {
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
  // Les abonnements partent avec le profil (clé étrangère en cascade).
  if (created.length > 0) {
    await database.db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
  }
});

afterAll(async () => {
  await database.close();
});

describe('DrizzleSubscriptionRepository', () => {
  it('sans ligne → null', async () => {
    await expect(repository.find(await newProfile())).resolves.toBeNull();
  });

  it('enregistre puis met à jour la copie locale', async () => {
    const userId = await newProfile();
    const first = {
      userId,
      status: 'active' as const,
      productId: 'com.killianboularand.cloneinstagram.plus.monthly',
      expiresAt: new Date('2026-10-25T12:00:00.000Z'),
      refreshedAt: new Date('2026-09-25T12:00:00.000Z'),
    };
    await repository.save(first);
    await expect(repository.find(userId)).resolves.toEqual(first);

    const second = {
      ...first,
      status: 'expired' as const,
      refreshedAt: new Date('2026-10-26T12:00:00.000Z'),
    };
    await repository.save(second);
    await expect(repository.find(userId)).resolves.toEqual(second);
  });
});

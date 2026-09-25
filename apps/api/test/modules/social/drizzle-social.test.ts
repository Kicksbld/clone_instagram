import { randomBytes } from 'node:crypto';

import { blocks, follows, newId, profiles, type NewProfileRow } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import {
  DrizzleFollowCounters,
  DrizzleFollowRepository,
} from '../../../src/modules/social/infrastructure/persistence/drizzle-follow-repository.ts';
import { DrizzleSocialGraphReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-social-graph-reader.ts';
import { canViewProfile } from '../../../src/shared/domain/visibility.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { connectTestDatabase } from '../../support/database.ts';

const database = connectTestDatabase();
const accounts = new DrizzleAccountReader(database.db);
const followRepository = new DrizzleFollowRepository(database.db);
const counters = new DrizzleFollowCounters(database.db);
const graph = new DrizzleSocialGraphReader(database.db);
const relationships = new DrizzleRelationshipReader(database.db);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `t${randomBytes(4).toString('hex')}`;

async function newProfile(
  suffix: string,
  fields: Partial<Omit<NewProfileRow, 'id' | 'username'>> = {},
): Promise<string> {
  const id = newId();
  created.push(id);
  await database.db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
    ...fields,
  });
  return id;
}

async function follow(followerId: string, followeeId: string, createdAt?: Date): Promise<void> {
  await database.db
    .insert(follows)
    .values({ followerId, followeeId, ...(createdAt && { createdAt }) });
}

afterEach(async () => {
  if (created.length > 0) {
    await database.db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
  }
});

afterAll(async () => {
  await database.close();
});

describe('DrizzleAccountReader', () => {
  it('lit statut, confidentialité et compteur ; null si absent', async () => {
    const id = await newProfile('a', { isPrivate: true, followerCount: 3 });

    await expect(accounts.findById(id)).resolves.toEqual({
      id,
      status: 'active',
      isPrivate: true,
      followerCount: 3,
    });
    await expect(accounts.findById(newId())).resolves.toBeNull();
  });
});

describe('DrizzleFollowRepository et DrizzleFollowCounters', () => {
  it('add / remove idempotents', async () => {
    const [a, b] = [await newProfile('a'), await newProfile('b')];

    await expect(followRepository.add(a, b)).resolves.toBe(true);
    await expect(followRepository.add(a, b)).resolves.toBe(false);
    await expect(followRepository.remove(a, b)).resolves.toBe(true);
    await expect(followRepository.remove(a, b)).resolves.toBe(false);
  });

  it('apply met à jour les deux compteurs et renvoie celui du compte suivi', async () => {
    const [a, b] = [await newProfile('a'), await newProfile('b', { followerCount: 4 })];

    await expect(counters.apply(a, b, 1)).resolves.toBe(5);
    await expect(counters.apply(a, b, -1)).resolves.toBe(4);
    await counters.apply(a, b, 1);

    const rows = await database.db
      .select({
        id: profiles.id,
        followers: profiles.followerCount,
        following: profiles.followingCount,
      })
      .from(profiles)
      .where(inArray(profiles.id, [a, b]));
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: a, followers: 0, following: 1 },
        { id: b, followers: 5, following: 0 },
      ]),
    );
  });

  it('follows croisés simultanés dans des transactions : sans interblocage', async () => {
    const [a, b] = [await newProfile('a'), await newProfile('b')];
    const cross = (x: string, y: string) =>
      database.db.transaction(async (tx) => {
        await new DrizzleFollowRepository(tx).add(x, y);
        await new DrizzleFollowCounters(tx).apply(x, y, 1);
      });

    await Promise.all(Array.from({ length: 5 }, (_, i) => (i % 2 ? cross(a, b) : cross(b, a))));

    await expect(accounts.findById(a)).resolves.toMatchObject({ followerCount: 3 });
  });
});

describe('DrizzleSocialGraphReader — listes', () => {
  it('abonnés et abonnements, le plus récent en premier, relation vue par l’appelant', async () => {
    const [viewer, owner, x, y] = [
      await newProfile('viewer'),
      await newProfile('owner'),
      await newProfile('x'),
      await newProfile('y'),
    ];
    await follow(x, owner, new Date('2026-01-01T00:00:00.001Z'));
    await follow(y, owner, new Date('2026-01-01T00:00:00.002Z'));
    await follow(viewer, owner, new Date('2026-01-01T00:00:00.003Z'));
    await follow(viewer, y);
    await follow(x, viewer);

    const page = await graph.listFollowers({
      ownerId: owner,
      viewerId: viewer,
      after: null,
      limit: 20,
    });

    expect(page.next).toBeNull();
    expect(page.items.map((u) => [u.id, u.relationship])).toEqual([
      [viewer, { following: false, followedBy: false }],
      [y, { following: true, followedBy: false }],
      [x, { following: false, followedBy: true }],
    ]);

    const following = await graph.listFollowing({
      ownerId: viewer,
      viewerId: viewer,
      after: null,
      limit: 20,
    });
    expect(following.items.map((u) => u.id)).toEqual([y, owner]);
  });

  it('pagine sans doublon ni trou, y compris à date égale (départage par id)', async () => {
    const owner = await newProfile('owner');
    const sameInstant = new Date('2026-02-01T00:00:00.000Z');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await newProfile(`f${i}`);
      ids.push(id);
      await follow(id, owner, sameInstant);
    }

    const seen: string[] = [];
    let after = null;
    do {
      const page = await graph.listFollowers({ ownerId: owner, viewerId: owner, after, limit: 2 });
      seen.push(...page.items.map((u) => u.id));
      after = page.next;
    } while (after);

    expect(seen).toEqual([...ids].sort().reverse());
  });

  it('filtre SQL identique à la politique de visibilité (ADR-006)', async () => {
    const [viewer, owner] = [await newProfile('viewer'), await newProfile('owner')];
    const cases = {
      public: await newProfile('public'),
      private: await newProfile('private', { isPrivate: true }),
      suspended: await newProfile('suspended', { status: 'suspended' }),
      banned: await newProfile('banned', { status: 'banned' }),
      blockedByViewer: await newProfile('blockedbyviewer'),
      blocksViewer: await newProfile('blocksviewer'),
    };
    for (const id of Object.values(cases)) await follow(id, owner);
    await database.db.insert(blocks).values([
      { blockerId: viewer, blockedId: cases.blockedByViewer },
      { blockerId: cases.blocksViewer, blockedId: viewer },
    ]);

    const page = await graph.listFollowers({
      ownerId: owner,
      viewerId: viewer,
      after: null,
      limit: 20,
    });

    const expected: string[] = [];
    for (const id of Object.values(cases)) {
      const account = await accounts.findById(id);
      if (account && canViewProfile(viewer, account, await relationships.between(viewer, id))) {
        expected.push(id);
      }
    }
    expect(page.items.map((u) => u.id).sort()).toEqual(expected.sort());
    expect(expected.sort()).toEqual([cases.public, cases.private].sort());
  });

  it('le profil supprimé en cascade n’a plus d’abonnement', async () => {
    const [a, b] = [await newProfile('a'), await newProfile('b')];
    await follow(a, b);
    await database.db.delete(profiles).where(eq(profiles.id, a));

    await expect(
      graph.listFollowers({ ownerId: b, viewerId: b, after: null, limit: 20 }),
    ).resolves.toEqual({ items: [], next: null });
  });
});

describe('DrizzleSocialGraphReader — recherche', () => {
  const search = (viewerId: string, query: string) => graph.search({ viewerId, query, limit: 30 });

  it('correspondance partielle sur le username ou le nom, insensible à la casse', async () => {
    const viewer = await newProfile('viewer');
    const byUsername = await newProfile('lea.martin');
    const byName = await newProfile('zz', { fullName: `Hugo ${RUN.toUpperCase()}Lea` });

    const results = await search(viewer, `${RUN}_lea`);
    expect(results.map((u) => u.id)).toEqual([byUsername]);
    const byFullName = await search(viewer, `${RUN}lea`);
    expect(byFullName.map((u) => u.id)).toEqual([byName]);
  });

  it('tri : username exact, préfixe, comptes suivis, abonnés', async () => {
    const viewer = await newProfile('viewer');
    const exact = await newProfile('ann');
    const prefixPopular = await newProfile('anna', { followerCount: 100 });
    const containsFollowed = await newProfile('x', { fullName: `Jo ${RUN}_ann` });
    const containsPopular = await newProfile('y', { fullName: `Al ${RUN}_ann`, followerCount: 50 });
    await follow(viewer, containsFollowed);

    const results = await search(viewer, `${RUN}_ann`);

    expect(results.map((u) => u.id)).toEqual([
      exact,
      prefixPopular,
      containsFollowed,
      containsPopular,
    ]);
    expect(results[2]?.relationship).toEqual({ following: true, followedBy: false });
  });

  it('`_` et `%` cherchés littéralement', async () => {
    const viewer = await newProfile('viewer');
    const target = await newProfile('a_b');
    await newProfile('axb');

    await expect(search(viewer, `${RUN}_a_b`)).resolves.toMatchObject([{ id: target }]);
    await expect(search(viewer, `${RUN}%`)).resolves.toEqual([]);
  });

  it('comptes bloqués et non actifs absents, privés présents, l’appelant aussi', async () => {
    const viewer = await newProfile('viewer');
    const priv = await newProfile('priv', { isPrivate: true });
    await newProfile('susp', { status: 'suspended' });
    const blocker = await newProfile('blocker');
    await database.db.insert(blocks).values({ blockerId: blocker, blockedId: viewer });

    const results = await search(viewer, RUN);

    expect(results.map((u) => u.id).sort()).toEqual([viewer, priv].sort());
  });
});

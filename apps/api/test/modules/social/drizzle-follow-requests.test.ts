import { randomBytes } from 'node:crypto';

import {
  type Executor,
  followRequests,
  follows,
  newId,
  notifications,
  profiles,
  type NewProfileRow,
} from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DrizzleNotificationWriter } from '../../../src/modules/activity/infrastructure/persistence/drizzle-notification-writer.ts';
import { UpdateSettings } from '../../../src/modules/identity/application/use-cases/update-settings.ts';
import { DrizzleProfileRepository } from '../../../src/modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { AcceptFollowRequest } from '../../../src/modules/social/application/use-cases/accept-follow-request.ts';
import { FollowUser } from '../../../src/modules/social/application/use-cases/follow-user.ts';
import { DrizzleAccountReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-account-reader.ts';
import {
  DrizzleFollowCounters,
  DrizzleFollowRepository,
} from '../../../src/modules/social/infrastructure/persistence/drizzle-follow-repository.ts';
import { DrizzleFollowRequestRepository } from '../../../src/modules/social/infrastructure/persistence/drizzle-follow-request-repository.ts';
import { SocialFollowRequestAccepter } from '../../../src/modules/social/infrastructure/follow-request-accepter.ts';
import { DrizzleSocialGraphReader } from '../../../src/modules/social/infrastructure/persistence/drizzle-social-graph-reader.ts';
import { DrizzleRelationshipReader } from '../../../src/shared/infrastructure/persistence/drizzle-relationship-reader.ts';
import { DrizzleUnitOfWork } from '../../../src/shared/infrastructure/persistence/drizzle-unit-of-work.ts';
import { connectTestDatabase } from '../../support/database.ts';
import { InMemoryNotificationDispatcher } from '../../support/in-memory-notifications.ts';

const database = connectTestDatabase();
const { db } = database;
const requests = new DrizzleFollowRequestRepository(db);
const graph = new DrizzleSocialGraphReader(db);
const relationships = new DrizzleRelationshipReader(db);
const dispatcher = new InMemoryNotificationDispatcher();
const followScope = (tx: Executor) => ({
  accounts: new DrizzleAccountReader(tx),
  relationships: new DrizzleRelationshipReader(tx),
  follows: new DrizzleFollowRepository(tx),
  requests: new DrizzleFollowRequestRepository(tx),
  counters: new DrizzleFollowCounters(tx),
  notifications: new DrizzleNotificationWriter(tx),
});
const follow = new FollowUser(new DrizzleUnitOfWork(db, followScope), dispatcher);
const accept = new AcceptFollowRequest(new DrizzleUnitOfWork(db, followScope), dispatcher);
const updateSettings = new UpdateSettings(
  new DrizzleUnitOfWork(db, (tx: Executor) => ({
    profiles: new DrizzleProfileRepository(tx),
    followRequests: new SocialFollowRequestAccepter({
      follows: new DrizzleFollowRepository(tx),
      requests: new DrizzleFollowRequestRepository(tx),
      counters: new DrizzleFollowCounters(tx),
      notifications: new DrizzleNotificationWriter(tx),
    }),
  })),
  dispatcher,
);
const created: string[] = [];

/** Préfixe propre à ce fichier de test : la base de dev n'est pas vidée entre deux exécutions. */
const RUN = `r${randomBytes(4).toString('hex')}`;

async function newProfile(
  suffix: string,
  fields: Partial<Omit<NewProfileRow, 'id' | 'username'>> = {},
): Promise<string> {
  const id = newId();
  created.push(id);
  await db.insert(profiles).values({
    id,
    username: `${RUN}_${suffix}`,
    fullName: 'Test',
    birthDate: '2000-01-31',
    ...fields,
  });
  return id;
}

async function counts(id: string) {
  const [row] = await db
    .select({ followerCount: profiles.followerCount, followingCount: profiles.followingCount })
    .from(profiles)
    .where(eq(profiles.id, id));
  return row;
}

async function notificationTypes(recipientId: string): Promise<string[]> {
  const rows = await db
    .select({ type: notifications.type })
    .from(notifications)
    .where(eq(notifications.recipientId, recipientId));
  return rows.map((row) => row.type).sort();
}

afterEach(async () => {
  if (created.length > 0) {
    await db.delete(profiles).where(inArray(profiles.id, created.splice(0)));
  }
});

afterAll(async () => {
  await database.close();
});

describe('DrizzleFollowRequestRepository', () => {
  it('add / remove idempotents ; removeAllTo supprime et renvoie les demandeurs dans l’ordre', async () => {
    const target = await newProfile('target', { isPrivate: true });
    const [a, b, c] = [await newProfile('a'), await newProfile('b'), await newProfile('c')];

    await expect(requests.add(a, target)).resolves.toBe(true);
    await expect(requests.add(a, target)).resolves.toBe(false);
    await requests.add(b, target);
    await requests.add(c, a);
    await expect(requests.remove(b, target)).resolves.toBe(true);
    await expect(requests.remove(b, target)).resolves.toBe(false);
    await requests.add(b, target);

    await expect(requests.removeAllTo(target)).resolves.toEqual([a, b]);
    await expect(requests.removeAllTo(target)).resolves.toEqual([]);
    const left = await db
      .select({ requesterId: followRequests.requesterId })
      .from(followRequests)
      .where(eq(followRequests.targetId, a));
    expect(left).toEqual([{ requesterId: c }]);
  });

  it('CHECK : pas de demande vers soi-même', async () => {
    const a = await newProfile('a');
    await expect(requests.add(a, a)).rejects.toThrow();
  });
});

describe('DrizzleRelationshipReader et DrizzleSocialGraphReader', () => {
  it('relation `requested` ; demandes reçues paginées, plus récente en premier, comptes visibles seulement', async () => {
    const target = await newProfile('target', { isPrivate: true });
    const ids = [];
    for (const [index, suffix] of ['a', 'b', 'c'].entries()) {
      const id = await newProfile(suffix);
      ids.push(id);
      await db.insert(followRequests).values({
        requesterId: id,
        targetId: target,
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
      });
    }
    const hidden = await newProfile('hidden', { status: 'suspended' });
    await requests.add(hidden, target);
    const [a, b, c] = ids;
    if (!a || !b || !c) throw new Error('profils manquants');

    await expect(relationships.between(a, target)).resolves.toMatchObject({
      viewerRequestedOwner: true,
      viewerFollowsOwner: false,
    });
    await expect(relationships.between(target, a)).resolves.toMatchObject({
      viewerRequestedOwner: false,
    });

    const first = await graph.listFollowRequests({ viewerId: target, after: null, limit: 2 });
    expect(first.items.map((user) => user.id)).toEqual([c, b]);
    expect(first.items[0]?.relationship).toEqual({
      following: false,
      followedBy: false,
      requested: false,
    });
    const second = await graph.listFollowRequests({
      viewerId: target,
      after: first.next,
      limit: 2,
    });
    expect(second.items.map((user) => user.id)).toEqual([a]);
    expect(second.next).toBeNull();

    const search = await graph.search({ viewerId: a, query: `${RUN}_target`, limit: 5 });
    expect(search[0]?.relationship.requested).toBe(true);
  });
});

describe('Demandes d’abonnement de bout en bout (transactions réelles)', () => {
  it('demande, acceptation : abonnement, compteurs et notifications', async () => {
    const target = await newProfile('target', { isPrivate: true });
    const requester = await newProfile('requester');

    await expect(follow.execute({ viewerId: requester, userId: target })).resolves.toEqual({
      following: false,
      requested: true,
      followerCount: 0,
    });
    expect(await notificationTypes(target)).toEqual(['follow_request']);

    await accept.execute({ viewerId: target, requesterId: requester });

    await expect(relationships.between(requester, target)).resolves.toMatchObject({
      viewerFollowsOwner: true,
      viewerRequestedOwner: false,
    });
    expect(await counts(target)).toEqual({ followerCount: 1, followingCount: 0 });
    expect(await counts(requester)).toEqual({ followerCount: 0, followingCount: 1 });
    expect(await notificationTypes(target)).toEqual(['follow']);
    expect(await notificationTypes(requester)).toEqual(['follow_accepted']);
  });

  it('passage en public : toutes les demandes acceptées dans la transaction, compteur relu', async () => {
    const target = await newProfile('target', { isPrivate: true });
    const [a, b] = [await newProfile('a'), await newProfile('b')];
    await follow.execute({ viewerId: a, userId: target });
    await follow.execute({ viewerId: b, userId: target });

    const profile = await updateSettings.execute({ userId: target, isPrivate: false });

    expect(profile).toMatchObject({ isPrivate: false, followerCount: 2 });
    const rows = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(eq(follows.followeeId, target));
    expect(rows.map((row) => row.followerId).sort()).toEqual([a, b].sort());
    await expect(requests.removeAllTo(target)).resolves.toEqual([]);
    expect(await notificationTypes(target)).toEqual(['follow', 'follow']);
  });
});

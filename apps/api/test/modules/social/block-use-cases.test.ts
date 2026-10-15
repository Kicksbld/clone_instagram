import { beforeEach, describe, expect, it } from 'vitest';

import {
  ProfileNotFoundError,
  UserNotFoundError,
} from '../../../src/modules/identity/domain/errors.ts';
import { BlockUser } from '../../../src/modules/social/application/use-cases/block-user.ts';
import { ListBlocks } from '../../../src/modules/social/application/use-cases/list-blocks.ts';
import { UnblockUser } from '../../../src/modules/social/application/use-cases/unblock-user.ts';
import { CannotBlockSelfError } from '../../../src/modules/social/domain/errors.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import { InMemoryBlocks, InMemorySocialGraph } from '../../support/in-memory-social-graph.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const THIRD = '0199a1b2-0000-7000-8000-000000000003';

let profiles: InMemoryProfileRepository;
let relationships: InMemoryRelationshipReader;
let graph: InMemorySocialGraph;
let block: BlockUser;
let unblock: UnblockUser;
let listBlocks: ListBlocks;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  relationships = new InMemoryRelationshipReader();
  graph = new InMemorySocialGraph(profiles, relationships);
  const blocks = new InMemoryBlocks(relationships);
  block = new BlockUser(
    new InMemoryUnitOfWork({
      accounts: graph,
      relationships,
      blocks,
      follows: graph,
      counters: graph,
    }),
  );
  unblock = new UnblockUser(graph, blocks);
  listBlocks = new ListBlocks(graph);
  profiles.add({ id: ME, username: 'killian' });
  profiles.add({ id: OTHER, username: 'lea' });
});

const counts = (id: string) => {
  const { followerCount, followingCount } = profiles.rows.get(id) ?? {};
  return { followerCount, followingCount };
};

/** Abonnement écrit directement, compteurs compris (comme le seed). */
const seedFollow = (followerId: string, followeeId: string) => {
  relationships.follow(followerId, followeeId);
  void graph.apply(followerId, followeeId, 1);
};

describe('BlockUser', () => {
  it('bloque et supprime les abonnements dans les deux sens, compteurs compris', async () => {
    seedFollow(ME, OTHER);
    seedFollow(OTHER, ME);

    await block.execute({ viewerId: ME, userId: OTHER });

    expect(relationships.isBlocking(ME, OTHER)).toBe(true);
    expect(relationships.isFollowing(ME, OTHER)).toBe(false);
    expect(relationships.isFollowing(OTHER, ME)).toBe(false);
    expect(counts(ME)).toEqual({ followerCount: 0, followingCount: 0 });
    expect(counts(OTHER)).toEqual({ followerCount: 0, followingCount: 0 });
  });

  it('abonnement dans un seul sens : seuls ses compteurs baissent', async () => {
    profiles.add({ id: THIRD, username: 'ines' });
    seedFollow(OTHER, ME);
    seedFollow(THIRD, ME);

    await block.execute({ viewerId: ME, userId: OTHER });

    expect(counts(ME)).toEqual({ followerCount: 1, followingCount: 0 });
    expect(counts(OTHER)).toEqual({ followerCount: 0, followingCount: 0 });
  });

  it('double blocage : sans effet', async () => {
    await block.execute({ viewerId: ME, userId: OTHER });
    await expect(block.execute({ viewerId: ME, userId: OTHER })).resolves.toBeUndefined();
    expect(relationships.blocks).toHaveLength(1);
  });

  it('se bloquer soi-même → cannot_block_self', async () => {
    await expect(block.execute({ viewerId: ME, userId: ME })).rejects.toBeInstanceOf(
      CannotBlockSelfError,
    );
  });

  it('compte qui m’a bloqué, inexistant ou suspendu → user_not_found', async () => {
    relationships.block(OTHER, ME);
    await expect(block.execute({ viewerId: ME, userId: OTHER })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    await expect(block.execute({ viewerId: ME, userId: THIRD })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    profiles.add({ id: THIRD, username: 'ines', status: 'suspended' });
    await expect(block.execute({ viewerId: ME, userId: THIRD })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(relationships.isBlocking(ME, OTHER)).toBe(false);
  });

  it('appelant sans profil → profile_not_found', async () => {
    await expect(block.execute({ viewerId: THIRD, userId: OTHER })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });
});

describe('UnblockUser', () => {
  it('débloque sans rétablir les abonnements', async () => {
    seedFollow(ME, OTHER);
    await block.execute({ viewerId: ME, userId: OTHER });

    await unblock.execute({ viewerId: ME, userId: OTHER });

    expect(relationships.isBlockedEitherWay(ME, OTHER)).toBe(false);
    expect(relationships.isFollowing(ME, OTHER)).toBe(false);
  });

  it('sans blocage : sans effet ; ne lève pas le blocage de l’autre', async () => {
    relationships.block(OTHER, ME);
    await expect(unblock.execute({ viewerId: ME, userId: OTHER })).resolves.toBeUndefined();
    expect(relationships.isBlocking(OTHER, ME)).toBe(true);
  });

  it('soi-même → cannot_block_self ; compte inexistant → user_not_found', async () => {
    await expect(unblock.execute({ viewerId: ME, userId: ME })).rejects.toBeInstanceOf(
      CannotBlockSelfError,
    );
    await expect(unblock.execute({ viewerId: ME, userId: THIRD })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});

describe('ListBlocks', () => {
  it('mes blocages, le plus récent en premier, comptes actifs seulement', async () => {
    profiles.add({ id: THIRD, username: 'ines' });
    await block.execute({ viewerId: ME, userId: OTHER });
    await block.execute({ viewerId: ME, userId: THIRD });
    relationships.block(OTHER, THIRD);

    const page = await listBlocks.execute({ viewerId: ME, after: null });
    expect(page.items.map((user) => user.username)).toEqual(['ines', 'lea']);
    expect(page.next).toBeNull();

    const third = profiles.rows.get(THIRD);
    if (third) third.status = 'banned';
    const active = await listBlocks.execute({ viewerId: ME, after: null });
    expect(active.items.map((user) => user.username)).toEqual(['lea']);
  });

  it('pagine par 20 sans doublon ni trou', async () => {
    const ids = Array.from(
      { length: 25 },
      (_, i) => `0199a1b2-0000-7000-8000-1000000000${String(i).padStart(2, '0')}`,
    );
    for (const [i, id] of ids.entries()) {
      profiles.add({ id, username: `user${i}` });
      await block.execute({ viewerId: ME, userId: id });
    }

    const first = await listBlocks.execute({ viewerId: ME, after: null });
    const second = await listBlocks.execute({ viewerId: ME, after: first.next });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map((user) => user.id)).size).toBe(25);
  });
});

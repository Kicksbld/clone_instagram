import { beforeEach, describe, expect, it } from 'vitest';

import {
  ProfileNotFoundError,
  UserNotFoundError,
} from '../../../src/modules/identity/domain/errors.ts';
import { AddCloseFriend } from '../../../src/modules/social/application/use-cases/add-close-friend.ts';
import { ListCloseFriends } from '../../../src/modules/social/application/use-cases/list-close-friends.ts';
import { RemoveCloseFriend } from '../../../src/modules/social/application/use-cases/remove-close-friend.ts';
import { CannotCloseFriendSelfError } from '../../../src/modules/social/domain/errors.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import { InMemoryCloseFriends, InMemorySocialGraph } from '../../support/in-memory-social-graph.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const THIRD = '0199a1b2-0000-7000-8000-000000000003';
const UNKNOWN = '0199a1b2-0000-7000-8000-00000000ffff';

let profiles: InMemoryProfileRepository;
let relationships: InMemoryRelationshipReader;
let graph: InMemorySocialGraph;
let add: AddCloseFriend;
let list: ListCloseFriends;
let remove: RemoveCloseFriend;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  relationships = new InMemoryRelationshipReader();
  graph = new InMemorySocialGraph(profiles, relationships);
  const closeFriends = new InMemoryCloseFriends(relationships);
  add = new AddCloseFriend(
    new InMemoryUnitOfWork({ accounts: graph, relationships, closeFriends }),
  );
  list = new ListCloseFriends(graph);
  remove = new RemoveCloseFriend(graph, closeFriends);
  profiles.add({ id: ME, username: 'killian' });
  profiles.add({ id: OTHER, username: 'lea' });
});

const listedIds = async (viewerId = ME) =>
  (await list.execute({ viewerId, after: null })).items.map((user) => user.id);

describe('AddCloseFriend', () => {
  it('ajoute un compte visible à ma liste', async () => {
    await add.execute({ viewerId: ME, userId: OTHER });

    expect(await listedIds()).toEqual([OTHER]);
  });

  it('liste privée : le compte ajouté ne me voit pas dans la sienne', async () => {
    await add.execute({ viewerId: ME, userId: OTHER });

    expect(await listedIds(OTHER)).toEqual([]);
  });

  it('double ajout : sans effet', async () => {
    await add.execute({ viewerId: ME, userId: OTHER });
    await expect(add.execute({ viewerId: ME, userId: OTHER })).resolves.toBeUndefined();

    expect(relationships.closeFriends).toHaveLength(1);
  });

  it('compte privé non suivi : visible, donc ajouté', async () => {
    profiles.add({ id: THIRD, username: 'ines', isPrivate: true });

    await add.execute({ viewerId: ME, userId: THIRD });

    expect(await listedIds()).toEqual([THIRD]);
  });

  it('s’ajouter soi-même → cannot_close_friend_self', async () => {
    await expect(add.execute({ viewerId: ME, userId: ME })).rejects.toBeInstanceOf(
      CannotCloseFriendSelfError,
    );
  });

  it.each([
    ['que j’ai bloqué', () => relationships.block(ME, OTHER)],
    ['qui m’a bloqué', () => relationships.block(OTHER, ME)],
    ['suspendu', () => profiles.add({ id: OTHER, username: 'lea', status: 'suspended' })],
  ])('compte %s → user_not_found, rien n’est ajouté', async (_, setUp) => {
    setUp();

    await expect(add.execute({ viewerId: ME, userId: OTHER })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(relationships.closeFriends).toHaveLength(0);
  });

  it('compte inexistant → user_not_found ; onboarding non terminé → profile_not_found', async () => {
    await expect(add.execute({ viewerId: ME, userId: UNKNOWN })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    await expect(add.execute({ viewerId: UNKNOWN, userId: OTHER })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });
});

describe('RemoveCloseFriend', () => {
  it('retire un compte de ma liste', async () => {
    await add.execute({ viewerId: ME, userId: OTHER });

    await remove.execute({ viewerId: ME, userId: OTHER });

    expect(await listedIds()).toEqual([]);
  });

  it('compte absent de la liste : sans effet', async () => {
    await expect(remove.execute({ viewerId: ME, userId: OTHER })).resolves.toBeUndefined();
  });

  it('soi-même → cannot_close_friend_self ; compte inexistant → user_not_found', async () => {
    await expect(remove.execute({ viewerId: ME, userId: ME })).rejects.toBeInstanceOf(
      CannotCloseFriendSelfError,
    );
    await expect(remove.execute({ viewerId: ME, userId: UNKNOWN })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});

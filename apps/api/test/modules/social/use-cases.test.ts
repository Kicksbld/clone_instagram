import { beforeEach, describe, expect, it } from 'vitest';

import {
  ProfileNotFoundError,
  UserNotFoundError,
} from '../../../src/modules/identity/domain/errors.ts';
import { FollowUser } from '../../../src/modules/social/application/use-cases/follow-user.ts';
import { ListFollowers } from '../../../src/modules/social/application/use-cases/list-followers.ts';
import { ListFollowing } from '../../../src/modules/social/application/use-cases/list-following.ts';
import { SearchUsers } from '../../../src/modules/social/application/use-cases/search-users.ts';
import { UnfollowUser } from '../../../src/modules/social/application/use-cases/unfollow-user.ts';
import {
  AccountPrivateError,
  CannotFollowSelfError,
} from '../../../src/modules/social/domain/errors.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import { InMemorySocialGraph } from '../../support/in-memory-social-graph.ts';

const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';
const THIRD = '0199a1b2-0000-7000-8000-000000000003';

let profiles: InMemoryProfileRepository;
let relationships: InMemoryRelationshipReader;
let graph: InMemorySocialGraph;
let follow: FollowUser;
let unfollow: UnfollowUser;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  relationships = new InMemoryRelationshipReader();
  graph = new InMemorySocialGraph(profiles, relationships);
  const transaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    follows: graph,
    counters: graph,
  });
  follow = new FollowUser(transaction);
  unfollow = new UnfollowUser(transaction);
  profiles.add({ id: ME, username: 'killian' });
});

const counts = (id: string) => {
  const { followerCount, followingCount } = profiles.rows.get(id) ?? {};
  return { followerCount, followingCount };
};

describe('FollowUser', () => {
  it('suit un compte public et met à jour les deux compteurs', async () => {
    profiles.add({ id: OTHER, username: 'lea', followerCount: 4 });

    await expect(follow.execute({ viewerId: ME, userId: OTHER })).resolves.toEqual({
      following: true,
      followerCount: 5,
    });
    expect(relationships.isFollowing(ME, OTHER)).toBe(true);
    expect(counts(OTHER)).toEqual({ followerCount: 5, followingCount: 0 });
    expect(counts(ME)).toEqual({ followerCount: 0, followingCount: 1 });
  });

  it('double follow : sans effet, compteurs inchangés', async () => {
    profiles.add({ id: OTHER, username: 'lea' });
    await follow.execute({ viewerId: ME, userId: OTHER });

    await expect(follow.execute({ viewerId: ME, userId: OTHER })).resolves.toEqual({
      following: true,
      followerCount: 1,
    });
    expect(counts(ME)).toEqual({ followerCount: 0, followingCount: 1 });
  });

  it('se suivre soi-même → cannot_follow_self', async () => {
    await expect(follow.execute({ viewerId: ME, userId: ME })).rejects.toBeInstanceOf(
      CannotFollowSelfError,
    );
  });

  it('compte privé non suivi → account_private, rien n’est écrit', async () => {
    profiles.add({ id: OTHER, username: 'lea', isPrivate: true });

    await expect(follow.execute({ viewerId: ME, userId: OTHER })).rejects.toBeInstanceOf(
      AccountPrivateError,
    );
    expect(relationships.isFollowing(ME, OTHER)).toBe(false);
    expect(counts(OTHER).followerCount).toBe(0);
  });

  it('compte privé déjà suivi : sans effet, pas de refus', async () => {
    profiles.add({ id: OTHER, username: 'lea', isPrivate: true, followerCount: 1 });
    relationships.follow(ME, OTHER);

    await expect(follow.execute({ viewerId: ME, userId: OTHER })).resolves.toEqual({
      following: true,
      followerCount: 1,
    });
  });

  it.each([
    ['inexistant', () => undefined],
    [
      'bloqué par moi',
      () => {
        relationships.block(ME, OTHER);
      },
    ],
    [
      'qui me bloque',
      () => {
        relationships.block(OTHER, ME);
      },
    ],
    ['suspendu', () => profiles.add({ id: OTHER, username: 'lea', status: 'suspended' })],
    ['banni', () => profiles.add({ id: OTHER, username: 'lea', status: 'banned' })],
  ])('compte %s → user_not_found', async (label, arrange) => {
    if (label !== 'inexistant') profiles.add({ id: OTHER, username: 'lea' });
    arrange();

    await expect(follow.execute({ viewerId: ME, userId: OTHER })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(relationships.isFollowing(ME, OTHER)).toBe(false);
  });

  it('appelant sans profil → profile_not_found', async () => {
    profiles.add({ id: OTHER, username: 'lea' });

    await expect(follow.execute({ viewerId: THIRD, userId: OTHER })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });
});

describe('UnfollowUser', () => {
  it('ne suit plus et décrémente les deux compteurs', async () => {
    profiles.add({ id: OTHER, username: 'lea' });
    await follow.execute({ viewerId: ME, userId: OTHER });

    await expect(unfollow.execute({ viewerId: ME, userId: OTHER })).resolves.toEqual({
      following: false,
      followerCount: 0,
    });
    expect(counts(ME)).toEqual({ followerCount: 0, followingCount: 0 });
  });

  it('sans abonnement : sans effet, compteurs inchangés', async () => {
    profiles.add({ id: OTHER, username: 'lea', followerCount: 2 });

    await expect(unfollow.execute({ viewerId: ME, userId: OTHER })).resolves.toEqual({
      following: false,
      followerCount: 2,
    });
  });

  it('compte privé suivi : possible', async () => {
    profiles.add({ id: ME, username: 'killian', followingCount: 1 });
    profiles.add({ id: OTHER, username: 'lea', isPrivate: true, followerCount: 1 });
    relationships.follow(ME, OTHER);

    await expect(unfollow.execute({ viewerId: ME, userId: OTHER })).resolves.toEqual({
      following: false,
      followerCount: 0,
    });
  });

  it('soi-même → cannot_follow_self', async () => {
    await expect(unfollow.execute({ viewerId: ME, userId: ME })).rejects.toBeInstanceOf(
      CannotFollowSelfError,
    );
  });

  it('compte bloqué → user_not_found', async () => {
    profiles.add({ id: OTHER, username: 'lea' });
    relationships.block(OTHER, ME);

    await expect(unfollow.execute({ viewerId: ME, userId: OTHER })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});

describe('ListFollowers / ListFollowing', () => {
  const listFollowers = () => new ListFollowers(graph, relationships, graph);
  const listFollowing = () => new ListFollowing(graph, relationships, graph);

  it('abonnés et abonnements, le plus récent en premier, avec la relation vue par moi', async () => {
    profiles.add({ id: OTHER, username: 'lea' });
    profiles.add({ id: THIRD, username: 'hugo' });
    relationships.follow(THIRD, OTHER);
    relationships.follow(ME, OTHER);
    relationships.follow(THIRD, ME);

    const followers = await listFollowers().execute({ viewerId: ME, userId: OTHER, after: null });
    expect(followers.items.map((u) => [u.username, u.relationship])).toEqual([
      ['killian', { following: false, followedBy: false }],
      ['hugo', { following: false, followedBy: true }],
    ]);
    expect(followers.next).toBeNull();

    const following = await listFollowing().execute({ viewerId: ME, userId: THIRD, after: null });
    expect(following.items.map((u) => u.username)).toEqual(['killian', 'lea']);
  });

  it('pagine par 20 sans doublon ni trou', async () => {
    profiles.add({ id: OTHER, username: 'lea' });
    for (let i = 0; i < 25; i++) {
      const id = `0199a1b2-0000-7000-8000-1000000000${String(i).padStart(2, '0')}`;
      profiles.add({ id, username: `u${i}` });
      relationships.follow(id, OTHER);
    }

    const first = await listFollowers().execute({ viewerId: ME, userId: OTHER, after: null });
    expect(first.items).toHaveLength(20);
    expect(first.next).not.toBeNull();
    const second = await listFollowers().execute({
      viewerId: ME,
      userId: OTHER,
      after: first.next,
    });
    expect(second.items).toHaveLength(5);
    expect(second.next).toBeNull();
    const all = [...first.items, ...second.items].map((u) => u.username);
    expect(new Set(all).size).toBe(25);
    expect(all[0]).toBe('u24');
  });

  it('comptes bloqués et non actifs absents de la liste', async () => {
    profiles.add({ id: OTHER, username: 'lea' });
    profiles.add({ id: THIRD, username: 'hugo' });
    const suspended = '0199a1b2-0000-7000-8000-000000000004';
    profiles.add({ id: suspended, username: 'ines', status: 'suspended' });
    relationships.follow(THIRD, OTHER);
    relationships.follow(suspended, OTHER);
    relationships.block(ME, THIRD);

    const page = await listFollowers().execute({ viewerId: ME, userId: OTHER, after: null });
    expect(page.items).toEqual([]);
  });

  it('compte privé non suivi → user_not_found ; suivi ou soi-même → visible', async () => {
    profiles.add({ id: OTHER, username: 'lea', isPrivate: true });
    await expect(
      listFollowers().execute({ viewerId: ME, userId: OTHER, after: null }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    relationships.follow(ME, OTHER);
    await expect(
      listFollowing().execute({ viewerId: ME, userId: OTHER, after: null }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      listFollowers().execute({ viewerId: OTHER, userId: OTHER, after: null }),
    ).resolves.toMatchObject({ items: [{ id: ME }] });
  });

  it.each([
    ['inexistant', () => undefined],
    [
      'qui me bloque',
      () => {
        relationships.block(OTHER, ME);
      },
    ],
    ['suspendu', () => profiles.add({ id: OTHER, username: 'lea', status: 'suspended' })],
  ])('compte %s → user_not_found', async (label, arrange) => {
    if (label !== 'inexistant') profiles.add({ id: OTHER, username: 'lea' });
    arrange();

    await expect(
      listFollowers().execute({ viewerId: ME, userId: OTHER, after: null }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('SearchUsers', () => {
  const search = (query: string) => new SearchUsers(graph).execute({ viewerId: ME, query });

  it('cherche par username ou par nom, nettoie la requête', async () => {
    profiles.add({ id: OTHER, username: 'lea.martin', fullName: 'Léa Martin' });
    profiles.add({ id: THIRD, username: 'hugo', fullName: 'Hugo Martin' });

    await expect(search('@LEA')).resolves.toMatchObject([{ username: 'lea.martin' }]);
    const byName = await search('martin');
    expect(byName.map((u) => u.username).sort()).toEqual(['hugo', 'lea.martin']);
  });

  it('comptes bloqués et non actifs absents, comptes privés présents', async () => {
    profiles.add({ id: OTHER, username: 'lea.blocked' });
    profiles.add({ id: THIRD, username: 'lea.private', isPrivate: true });
    profiles.add({
      id: '0199a1b2-0000-7000-8000-000000000004',
      username: 'lea.banned',
      status: 'banned',
    });
    relationships.block(OTHER, ME);

    await expect(search('lea')).resolves.toMatchObject([{ username: 'lea.private' }]);
  });

  it('requête vide après nettoyage → aucun résultat', async () => {
    await expect(search(' @ ')).resolves.toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { UpdateSettings } from '../../../src/modules/identity/application/use-cases/update-settings.ts';
import {
  ProfileNotFoundError,
  UserNotFoundError,
} from '../../../src/modules/identity/domain/errors.ts';
import { AcceptFollowRequest } from '../../../src/modules/social/application/use-cases/accept-follow-request.ts';
import { BlockUser } from '../../../src/modules/social/application/use-cases/block-user.ts';
import { DeclineFollowRequest } from '../../../src/modules/social/application/use-cases/decline-follow-request.ts';
import { FollowUser } from '../../../src/modules/social/application/use-cases/follow-user.ts';
import { ListFollowRequests } from '../../../src/modules/social/application/use-cases/list-follow-requests.ts';
import { RemoveFollower } from '../../../src/modules/social/application/use-cases/remove-follower.ts';
import { UnfollowUser } from '../../../src/modules/social/application/use-cases/unfollow-user.ts';
import {
  CannotFollowSelfError,
  FollowRequestNotFoundError,
} from '../../../src/modules/social/domain/errors.ts';
import { SocialFollowRequestAccepter } from '../../../src/modules/social/infrastructure/follow-request-accepter.ts';
import { canViewContent } from '../../../src/shared/domain/visibility.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import {
  InMemoryNotificationDispatcher,
  InMemoryNotifications,
} from '../../support/in-memory-notifications.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';
import { InMemoryRelationshipReader } from '../../support/in-memory-relationship-reader.ts';
import {
  InMemoryBlocks,
  InMemoryCloseFriends,
  InMemoryFollowRequests,
  InMemorySocialGraph,
} from '../../support/in-memory-social-graph.ts';

const PRIVATE = '0199a1b2-0000-7000-8000-000000000001';
const REQUESTER = '0199a1b2-0000-7000-8000-000000000002';
const OTHER = '0199a1b2-0000-7000-8000-000000000003';

let profiles: InMemoryProfileRepository;
let relationships: InMemoryRelationshipReader;
let notifications: InMemoryNotifications;
let dispatcher: InMemoryNotificationDispatcher;
let follow: FollowUser;
let unfollow: UnfollowUser;
let accept: AcceptFollowRequest;
let decline: DeclineFollowRequest;
let removeFollower: RemoveFollower;
let listRequests: ListFollowRequests;
let block: BlockUser;
let updateSettings: UpdateSettings;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  relationships = new InMemoryRelationshipReader();
  const graph = new InMemorySocialGraph(profiles, relationships);
  const requests = new InMemoryFollowRequests(relationships);
  notifications = new InMemoryNotifications(relationships);
  dispatcher = new InMemoryNotificationDispatcher();
  const transaction = new InMemoryUnitOfWork({
    accounts: graph,
    relationships,
    follows: graph,
    requests,
    counters: graph,
    notifications,
  });
  follow = new FollowUser(transaction, dispatcher);
  unfollow = new UnfollowUser(transaction);
  accept = new AcceptFollowRequest(transaction, dispatcher);
  decline = new DeclineFollowRequest(transaction);
  removeFollower = new RemoveFollower(transaction);
  listRequests = new ListFollowRequests(graph);
  block = new BlockUser(
    new InMemoryUnitOfWork({
      accounts: graph,
      relationships,
      blocks: new InMemoryBlocks(relationships),
      follows: graph,
      requests,
      closeFriends: new InMemoryCloseFriends(relationships),
      counters: graph,
      notifications,
    }),
  );
  updateSettings = new UpdateSettings(
    new InMemoryUnitOfWork({
      profiles,
      followRequests: new SocialFollowRequestAccepter({
        follows: graph,
        requests,
        counters: graph,
        notifications,
      }),
    }),
    dispatcher,
  );
  profiles.add({ id: PRIVATE, username: 'prive', isPrivate: true });
  profiles.add({ id: REQUESTER, username: 'demandeur' });
});

const counts = (id: string) => {
  const { followerCount, followingCount } = profiles.rows.get(id) ?? {};
  return { followerCount, followingCount };
};

const canSeeContents = async (viewerId: string, ownerId: string) => {
  const owner = profiles.rows.get(ownerId);
  if (!owner) throw new Error('profil absent');
  return canViewContent(viewerId, owner, await relationships.between(viewerId, ownerId));
};

const request = () => follow.execute({ viewerId: REQUESTER, userId: PRIVATE });

describe('FollowUser vers un compte privé', () => {
  it('crée une demande sans accès aux contenus, notifiée au compte privé', async () => {
    await expect(request()).resolves.toEqual({
      following: false,
      requested: true,
      followerCount: 0,
    });

    expect(relationships.hasRequested(REQUESTER, PRIVATE)).toBe(true);
    expect(await canSeeContents(REQUESTER, PRIVATE)).toBe(false);
    expect(counts(PRIVATE)).toEqual({ followerCount: 0, followingCount: 0 });
    const requested = { recipientId: PRIVATE, actorId: REQUESTER, type: 'follow_request' };
    expect(notifications.receivedBy(PRIVATE)).toEqual([requested]);
    expect(dispatcher.dispatched).toMatchObject([requested]);
  });

  it('double demande : sans effet, une seule notification', async () => {
    await request();
    await expect(request()).resolves.toMatchObject({ requested: true });

    expect(relationships.requests).toHaveLength(1);
    expect(notifications.receivedBy(PRIVATE)).toHaveLength(1);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('compte public : abonnement direct, sans demande', async () => {
    profiles.add({ id: OTHER, username: 'public' });

    await expect(follow.execute({ viewerId: REQUESTER, userId: OTHER })).resolves.toEqual({
      following: true,
      requested: false,
      followerCount: 1,
    });
    expect(relationships.requests).toEqual([]);
  });

  it('compte qui m’a bloqué, ou que j’ai bloqué → user_not_found, aucune demande', async () => {
    relationships.block(PRIVATE, REQUESTER);
    await expect(request()).rejects.toBeInstanceOf(UserNotFoundError);

    relationships.unblock(PRIVATE, REQUESTER);
    relationships.block(REQUESTER, PRIVATE);
    await expect(request()).rejects.toBeInstanceOf(UserNotFoundError);
    expect(relationships.requests).toEqual([]);
  });

  it('se demander soi-même → cannot_follow_self', async () => {
    await expect(follow.execute({ viewerId: PRIVATE, userId: PRIVATE })).rejects.toBeInstanceOf(
      CannotFollowSelfError,
    );
  });
});

describe('UnfollowUser : annuler sa demande', () => {
  it('supprime la demande et retire la notification', async () => {
    await request();

    await expect(unfollow.execute({ viewerId: REQUESTER, userId: PRIVATE })).resolves.toEqual({
      following: false,
      requested: false,
      followerCount: 0,
    });
    expect(relationships.requests).toEqual([]);
    expect(notifications.receivedBy(PRIVATE)).toEqual([]);
  });
});

describe('AcceptFollowRequest', () => {
  it('crée l’abonnement (compteurs), supprime la demande, notifie les deux comptes', async () => {
    await request();
    dispatcher.dispatched.length = 0;

    await accept.execute({ viewerId: PRIVATE, requesterId: REQUESTER });

    expect(relationships.isFollowing(REQUESTER, PRIVATE)).toBe(true);
    expect(relationships.requests).toEqual([]);
    expect(await canSeeContents(REQUESTER, PRIVATE)).toBe(true);
    expect(counts(PRIVATE)).toEqual({ followerCount: 1, followingCount: 0 });
    expect(counts(REQUESTER)).toEqual({ followerCount: 0, followingCount: 1 });
    const followed = { recipientId: PRIVATE, actorId: REQUESTER, type: 'follow' };
    const accepted = { recipientId: REQUESTER, actorId: PRIVATE, type: 'follow_accepted' };
    expect(notifications.receivedBy(PRIVATE)).toEqual([followed]);
    expect(notifications.receivedBy(REQUESTER)).toEqual([accepted]);
    expect(dispatcher.dispatched).toMatchObject([followed, accepted]);
  });

  it('demande annulée entre-temps → follow_request_not_found, rien n’est écrit', async () => {
    await request();
    await unfollow.execute({ viewerId: REQUESTER, userId: PRIVATE });

    await expect(
      accept.execute({ viewerId: PRIVATE, requesterId: REQUESTER }),
    ).rejects.toBeInstanceOf(FollowRequestNotFoundError);
    expect(relationships.isFollowing(REQUESTER, PRIVATE)).toBe(false);
    expect(counts(PRIVATE).followerCount).toBe(0);
  });

  it('demandeur inconnu ou devenu inactif → follow_request_not_found', async () => {
    await expect(accept.execute({ viewerId: PRIVATE, requesterId: OTHER })).rejects.toBeInstanceOf(
      FollowRequestNotFoundError,
    );

    await request();
    await profiles.transitionStatus(REQUESTER, ['active'], 'suspended');
    await expect(
      accept.execute({ viewerId: PRIVATE, requesterId: REQUESTER }),
    ).rejects.toBeInstanceOf(FollowRequestNotFoundError);
    expect(relationships.hasRequested(REQUESTER, PRIVATE)).toBe(true);
  });

  it('nouvelle acceptation après un désabonnement : notification `follow_accepted` renouvelée', async () => {
    await request();
    await accept.execute({ viewerId: PRIVATE, requesterId: REQUESTER });
    await unfollow.execute({ viewerId: REQUESTER, userId: PRIVATE });
    await request();
    dispatcher.dispatched.length = 0;

    await accept.execute({ viewerId: PRIVATE, requesterId: REQUESTER });

    expect(notifications.receivedBy(REQUESTER)).toHaveLength(1);
    expect(dispatcher.dispatched).toMatchObject([
      { type: 'follow' },
      { recipientId: REQUESTER, type: 'follow_accepted' },
    ]);
  });
});

describe('DeclineFollowRequest', () => {
  it('supprime la demande et sa notification, sans prévenir le demandeur', async () => {
    await request();

    await decline.execute({ viewerId: PRIVATE, requesterId: REQUESTER });

    expect(relationships.requests).toEqual([]);
    expect(relationships.isFollowing(REQUESTER, PRIVATE)).toBe(false);
    expect(notifications.receivedBy(PRIVATE)).toEqual([]);
    expect(notifications.receivedBy(REQUESTER)).toEqual([]);
  });

  it('demande inexistante → follow_request_not_found', async () => {
    await expect(
      decline.execute({ viewerId: PRIVATE, requesterId: REQUESTER }),
    ).rejects.toBeInstanceOf(FollowRequestNotFoundError);
  });
});

describe('ListFollowRequests', () => {
  it('demandes reçues, la plus récente en premier, sans comptes inactifs ; relation `requested` vue par l’appelant', async () => {
    profiles.add({ id: OTHER, username: 'autre' });
    await request();
    await follow.execute({ viewerId: OTHER, userId: PRIVATE });

    const page = await listRequests.execute({ viewerId: PRIVATE, after: null });
    expect(page.items.map((user) => user.username)).toEqual(['autre', 'demandeur']);
    expect(page.next).toBeNull();

    await profiles.transitionStatus(OTHER, ['active'], 'banned');
    const filtered = await listRequests.execute({ viewerId: PRIVATE, after: null });
    expect(filtered.items.map((user) => user.username)).toEqual(['demandeur']);

    const seen = await listRequests.execute({ viewerId: REQUESTER, after: null });
    expect(seen.items).toEqual([]);
  });
});

describe('RemoveFollower', () => {
  it('retire l’abonné (compteurs, notification `follow`) ; idempotent', async () => {
    await request();
    await accept.execute({ viewerId: PRIVATE, requesterId: REQUESTER });

    await removeFollower.execute({ viewerId: PRIVATE, userId: REQUESTER });
    await removeFollower.execute({ viewerId: PRIVATE, userId: REQUESTER });

    expect(relationships.isFollowing(REQUESTER, PRIVATE)).toBe(false);
    expect(counts(PRIVATE)).toEqual({ followerCount: 0, followingCount: 0 });
    expect(counts(REQUESTER)).toEqual({ followerCount: 0, followingCount: 0 });
    expect(notifications.receivedBy(PRIVATE)).toEqual([]);
    expect(await canSeeContents(REQUESTER, PRIVATE)).toBe(false);
  });

  it('soi-même → cannot_follow_self ; compte inconnu ou bloqué → user_not_found', async () => {
    await expect(
      removeFollower.execute({ viewerId: PRIVATE, userId: PRIVATE }),
    ).rejects.toBeInstanceOf(CannotFollowSelfError);
    await expect(
      removeFollower.execute({ viewerId: PRIVATE, userId: OTHER }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    relationships.block(REQUESTER, PRIVATE);
    await expect(
      removeFollower.execute({ viewerId: PRIVATE, userId: REQUESTER }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('BlockUser et demandes', () => {
  it('supprime les demandes dans les deux sens, avec leur notification', async () => {
    profiles.add({ id: OTHER, username: 'autre', isPrivate: true });
    await profiles.update(REQUESTER, { isPrivate: true });
    await request();
    await follow.execute({ viewerId: PRIVATE, userId: REQUESTER });
    await follow.execute({ viewerId: OTHER, userId: PRIVATE });
    expect(relationships.hasRequested(PRIVATE, REQUESTER)).toBe(true);

    await block.execute({ viewerId: PRIVATE, userId: REQUESTER });

    expect(relationships.hasRequested(REQUESTER, PRIVATE)).toBe(false);
    expect(relationships.hasRequested(PRIVATE, REQUESTER)).toBe(false);
    expect(relationships.hasRequested(OTHER, PRIVATE)).toBe(true);
    expect(notifications.receivedBy(PRIVATE)).toEqual([
      { recipientId: PRIVATE, actorId: OTHER, type: 'follow_request' },
    ]);
    expect(notifications.receivedBy(REQUESTER)).toEqual([]);
  });
});

describe('UpdateSettings : passage en public', () => {
  it('accepte toutes les demandes en attente, compteurs et notifications compris', async () => {
    profiles.add({ id: OTHER, username: 'autre' });
    await request();
    await follow.execute({ viewerId: OTHER, userId: PRIVATE });
    dispatcher.dispatched.length = 0;

    const profile = await updateSettings.execute({ userId: PRIVATE, isPrivate: false });

    expect(profile).toMatchObject({ isPrivate: false, followerCount: 2 });
    expect(relationships.requests).toEqual([]);
    expect(relationships.isFollowing(REQUESTER, PRIVATE)).toBe(true);
    expect(relationships.isFollowing(OTHER, PRIVATE)).toBe(true);
    expect(counts(REQUESTER).followingCount).toBe(1);
    expect(notifications.receivedBy(PRIVATE).map((n) => n.type)).toEqual(['follow', 'follow']);
    expect(notifications.receivedBy(REQUESTER).map((n) => n.type)).toEqual(['follow_accepted']);
    expect(dispatcher.dispatched).toHaveLength(4);
  });

  it('passage en privé : aucune demande touchée ; profil absent → profile_not_found', async () => {
    await request();
    await updateSettings.execute({ userId: PRIVATE, isPrivate: true });
    expect(relationships.hasRequested(REQUESTER, PRIVATE)).toBe(true);

    await expect(
      updateSettings.execute({ userId: OTHER, isPrivate: false }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

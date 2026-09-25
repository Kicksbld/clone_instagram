import { describe, expect, it } from 'vitest';

import {
  canMessage,
  canViewContent,
  canViewProfile,
  canViewStory,
  isMutual,
  SELF_RELATIONSHIP,
  type Relationship,
  type VisibilitySubject,
} from '../../src/shared/domain/visibility.ts';

const VIEWER = 'viewer';
const owner = (overrides: Partial<VisibilitySubject> = {}): VisibilitySubject => ({
  id: 'owner',
  status: 'active',
  isPrivate: false,
  ...overrides,
});
const relation = (overrides: Partial<Relationship> = {}): Relationship => ({
  ...SELF_RELATIONSHIP,
  ...overrides,
});

describe('canViewProfile', () => {
  it.each([
    ['compte public', owner(), relation(), true],
    ['compte privé non suivi : en-tête visible', owner({ isPrivate: true }), relation(), true],
    ['blocage dans un sens ou dans l’autre', owner(), relation({ blocked: true }), false],
    [
      'blocage malgré un abonnement',
      owner(),
      relation({ blocked: true, viewerFollowsOwner: true }),
      false,
    ],
    ['compte suspendu', owner({ status: 'suspended' }), relation(), false],
    ['compte banni', owner({ status: 'banned' }), relation(), false],
  ])('%s', (_, subject, rel, expected) => {
    expect(canViewProfile(VIEWER, subject, rel)).toBe(expected);
  });

  it('son propre profil, même suspendu', () => {
    expect(canViewProfile('owner', owner({ status: 'suspended' }), SELF_RELATIONSHIP)).toBe(true);
  });
});

describe('canViewContent', () => {
  it.each([
    ['compte public', owner(), relation(), true],
    ['compte privé non suivi', owner({ isPrivate: true }), relation(), false],
    [
      'compte privé suivi',
      owner({ isPrivate: true }),
      relation({ viewerFollowsOwner: true }),
      true,
    ],
    [
      'compte privé qui me suit sans que je le suive',
      owner({ isPrivate: true }),
      relation({ ownerFollowsViewer: true }),
      false,
    ],
    ['compte public bloqué', owner(), relation({ blocked: true }), false],
    [
      'compte suspendu suivi',
      owner({ status: 'suspended' }),
      relation({ viewerFollowsOwner: true }),
      false,
    ],
  ])('%s', (_, subject, rel, expected) => {
    expect(canViewContent(VIEWER, subject, rel)).toBe(expected);
  });

  it('ses propres contenus, compte privé', () => {
    expect(canViewContent('owner', owner({ isPrivate: true }), SELF_RELATIONSHIP)).toBe(true);
  });
});

describe('canViewStory', () => {
  it.each([
    ['audience everyone', 'everyone', relation(), true],
    ['amis proches, hors de la liste', 'close_friends', relation(), false],
    ['amis proches, dans la liste', 'close_friends', relation({ viewerIsCloseFriend: true }), true],
    [
      'amis proches mais bloqué',
      'close_friends',
      relation({ viewerIsCloseFriend: true, blocked: true }),
      false,
    ],
  ] as const)('%s', (_, audience, rel, expected) => {
    expect(canViewStory(VIEWER, { author: owner(), audience }, rel)).toBe(expected);
  });

  it('compte privé non suivi : aucune story', () => {
    const story = { author: owner({ isPrivate: true }), audience: 'everyone' } as const;
    expect(canViewStory(VIEWER, story, relation())).toBe(false);
  });

  it('ses propres stories amis proches', () => {
    const story = { author: owner(), audience: 'close_friends' } as const;
    expect(canViewStory('owner', story, SELF_RELATIONSHIP)).toBe(true);
  });
});

describe('canMessage', () => {
  it('suit canViewProfile', () => {
    expect(canMessage(VIEWER, owner({ isPrivate: true }), relation())).toBe(true);
    expect(canMessage(VIEWER, owner(), relation({ blocked: true }))).toBe(false);
    expect(canMessage(VIEWER, owner({ status: 'banned' }), relation())).toBe(false);
  });
});

describe('isMutual', () => {
  it('abonnement dans les deux sens uniquement', () => {
    expect(isMutual(relation({ viewerFollowsOwner: true, ownerFollowsViewer: true }))).toBe(true);
    expect(isMutual(relation({ viewerFollowsOwner: true }))).toBe(false);
    expect(isMutual(relation({ ownerFollowsViewer: true }))).toBe(false);
  });
});

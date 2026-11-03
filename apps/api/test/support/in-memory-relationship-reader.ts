import type { RelationshipReader } from '../../src/shared/application/relationship-reader.ts';
import type { Relationship } from '../../src/shared/domain/visibility.ts';

/** Abonnement enregistré, avec sa date (ordre des listes d'abonnés). */
export interface FollowEntry {
  followerId: string;
  followeeId: string;
  createdAt: Date;
}

/** Blocage enregistré, avec sa date. */
export interface BlockEntry {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

/** Demande d'abonnement enregistrée, avec sa date (ordre des demandes reçues). */
export interface FollowRequestEntry {
  requesterId: string;
  targetId: string;
  createdAt: Date;
}

/** Ami proche enregistré, avec sa date (ordre de la liste). */
export interface CloseFriendEntry {
  ownerId: string;
  friendId: string;
  createdAt: Date;
}

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que les tables `follows`, `follow_requests` et
 * `blocks`.
 */
export class InMemoryRelationshipReader implements RelationshipReader {
  private readonly followEntries = new Map<string, FollowEntry>();
  private readonly requestEntries = new Map<string, FollowRequestEntry>();
  /** Blocages et leur date (ordre de la liste des bloqués). */
  private readonly blockEntries = new Map<string, BlockEntry>();
  private readonly closeFriendEntries = new Map<string, CloseFriendEntry>();
  private clock = Date.parse('2026-01-01T00:00:00.000Z');

  /** Abonnement créé 1 ms après le précédent ; `false` s'il existait déjà. */
  follow(followerId: string, followeeId: string): boolean {
    const key = `${followerId}>${followeeId}`;
    if (this.followEntries.has(key)) return false;
    this.clock += 1;
    this.followEntries.set(key, { followerId, followeeId, createdAt: new Date(this.clock) });
    return true;
  }

  unfollow(followerId: string, followeeId: string): boolean {
    return this.followEntries.delete(`${followerId}>${followeeId}`);
  }

  isFollowing(followerId: string, followeeId: string): boolean {
    return this.followEntries.has(`${followerId}>${followeeId}`);
  }

  get follows(): FollowEntry[] {
    return [...this.followEntries.values()];
  }

  /** Demande créée 1 ms après l'écriture précédente ; `false` si elle existait déjà. */
  request(requesterId: string, targetId: string): boolean {
    const key = `${requesterId}>${targetId}`;
    if (this.requestEntries.has(key)) return false;
    this.clock += 1;
    this.requestEntries.set(key, { requesterId, targetId, createdAt: new Date(this.clock) });
    return true;
  }

  removeRequest(requesterId: string, targetId: string): boolean {
    return this.requestEntries.delete(`${requesterId}>${targetId}`);
  }

  hasRequested(requesterId: string, targetId: string): boolean {
    return this.requestEntries.has(`${requesterId}>${targetId}`);
  }

  get requests(): FollowRequestEntry[] {
    return [...this.requestEntries.values()];
  }

  /** Blocage créé 1 ms après l'écriture précédente ; `false` s'il existait déjà. */
  block(blockerId: string, blockedId: string): boolean {
    const key = `${blockerId}>${blockedId}`;
    if (this.blockEntries.has(key)) return false;
    this.clock += 1;
    this.blockEntries.set(key, { blockerId, blockedId, createdAt: new Date(this.clock) });
    return true;
  }

  unblock(blockerId: string, blockedId: string): boolean {
    return this.blockEntries.delete(`${blockerId}>${blockedId}`);
  }

  isBlocking(blockerId: string, blockedId: string): boolean {
    return this.blockEntries.has(`${blockerId}>${blockedId}`);
  }

  get blocks(): BlockEntry[] {
    return [...this.blockEntries.values()];
  }

  /** Ami proche ajouté 1 ms après l'écriture précédente ; `false` s'il l'était déjà. */
  addCloseFriend(ownerId: string, friendId: string): boolean {
    const key = `${ownerId}>${friendId}`;
    if (this.closeFriendEntries.has(key)) return false;
    this.clock += 1;
    this.closeFriendEntries.set(key, { ownerId, friendId, createdAt: new Date(this.clock) });
    return true;
  }

  removeCloseFriend(ownerId: string, friendId: string): boolean {
    return this.closeFriendEntries.delete(`${ownerId}>${friendId}`);
  }

  isCloseFriend(ownerId: string, friendId: string): boolean {
    return this.closeFriendEntries.has(`${ownerId}>${friendId}`);
  }

  get closeFriends(): CloseFriendEntry[] {
    return [...this.closeFriendEntries.values()];
  }

  isBlockedEitherWay(a: string, b: string): boolean {
    return this.isBlocking(a, b) || this.isBlocking(b, a);
  }

  between(viewerId: string, ownerId: string): Promise<Relationship> {
    return Promise.resolve({
      viewerFollowsOwner: this.isFollowing(viewerId, ownerId),
      ownerFollowsViewer: this.isFollowing(ownerId, viewerId),
      viewerRequestedOwner: this.hasRequested(viewerId, ownerId),
      blocked: this.isBlockedEitherWay(viewerId, ownerId),
      viewerIsCloseFriend: this.isCloseFriend(ownerId, viewerId),
    });
  }
}

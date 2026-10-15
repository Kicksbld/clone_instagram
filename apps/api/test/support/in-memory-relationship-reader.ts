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

/** Adapter en mémoire (ADR-005) : mêmes règles que les tables `follows` et `blocks`. */
export class InMemoryRelationshipReader implements RelationshipReader {
  private readonly followEntries = new Map<string, FollowEntry>();
  /** Blocages et leur date (ordre de la liste des bloqués). */
  private readonly blockEntries = new Map<string, BlockEntry>();
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

  isBlockedEitherWay(a: string, b: string): boolean {
    return this.isBlocking(a, b) || this.isBlocking(b, a);
  }

  between(viewerId: string, ownerId: string): Promise<Relationship> {
    return Promise.resolve({
      viewerFollowsOwner: this.isFollowing(viewerId, ownerId),
      ownerFollowsViewer: this.isFollowing(ownerId, viewerId),
      blocked: this.isBlockedEitherWay(viewerId, ownerId),
      viewerIsCloseFriend: false,
    });
  }
}

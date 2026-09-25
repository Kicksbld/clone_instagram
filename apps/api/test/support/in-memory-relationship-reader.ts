import type { RelationshipReader } from '../../src/shared/application/relationship-reader.ts';
import type { Relationship } from '../../src/shared/domain/visibility.ts';

/** Abonnement enregistré, avec sa date (ordre des listes d'abonnés). */
export interface FollowEntry {
  followerId: string;
  followeeId: string;
  createdAt: Date;
}

/** Adapter en mémoire (ADR-005) : mêmes règles que les tables `follows` et `blocks`. */
export class InMemoryRelationshipReader implements RelationshipReader {
  private readonly followEntries = new Map<string, FollowEntry>();
  private readonly blocks = new Set<string>();
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

  block(blockerId: string, blockedId: string): void {
    this.blocks.add(`${blockerId}>${blockedId}`);
  }

  isBlockedEitherWay(a: string, b: string): boolean {
    return this.blocks.has(`${a}>${b}`) || this.blocks.has(`${b}>${a}`);
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

import type { RelationshipReader } from '../../src/shared/application/relationship-reader.ts';
import type { Relationship } from '../../src/shared/domain/visibility.ts';

/** Adapter en mémoire (ADR-005) : mêmes règles que les tables `follows` et `blocks`. */
export class InMemoryRelationshipReader implements RelationshipReader {
  private readonly follows = new Set<string>();
  private readonly blocks = new Set<string>();

  follow(followerId: string, followeeId: string): void {
    this.follows.add(`${followerId}>${followeeId}`);
  }

  block(blockerId: string, blockedId: string): void {
    this.blocks.add(`${blockerId}>${blockedId}`);
  }

  between(viewerId: string, ownerId: string): Promise<Relationship> {
    return Promise.resolve({
      viewerFollowsOwner: this.follows.has(`${viewerId}>${ownerId}`),
      ownerFollowsViewer: this.follows.has(`${ownerId}>${viewerId}`),
      blocked:
        this.blocks.has(`${viewerId}>${ownerId}`) || this.blocks.has(`${ownerId}>${viewerId}`),
      viewerIsCloseFriend: false,
    });
  }
}

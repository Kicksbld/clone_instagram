import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { LikeStatus } from '../../domain/like.ts';
import type { LikeTransaction } from '../ports/like-transaction.ts';
import { requireLikeablePost } from '../require-likeable-post.ts';

/**
 * Aimer un post visible (use case de référence d'ADR-005), y compris le sien. Idempotent :
 * `like_count` n'augmente que si le like est créé. Pas de notification en P0.
 */
export class LikePost {
  constructor(private readonly transaction: UnitOfWork<LikeTransaction>) {}

  execute(input: { viewerId: string; postId: string }): Promise<LikeStatus> {
    return this.transaction.run(async (scope) => {
      const post = await requireLikeablePost(scope, input.viewerId, input.postId);
      const created = await scope.likes.add(input.viewerId, post.id);
      const likeCount = created ? await scope.likes.applyLikeCount(post.id, 1) : post.likeCount;
      return { liked: true, likeCount };
    });
  }
}

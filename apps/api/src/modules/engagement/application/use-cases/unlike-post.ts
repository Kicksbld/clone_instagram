import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { LikeStatus } from '../../domain/like.ts';
import type { LikeTransaction } from '../ports/like-transaction.ts';
import { requireLikeablePost } from '../require-likeable-post.ts';

/**
 * Ne plus aimer un post visible. Idempotent : `like_count` ne baisse que si le like est supprimé ;
 * post invisible ou supprimé → `post_not_found`, comme pour le like.
 */
export class UnlikePost {
  constructor(private readonly transaction: UnitOfWork<LikeTransaction>) {}

  execute(input: { viewerId: string; postId: string }): Promise<LikeStatus> {
    return this.transaction.run(async (scope) => {
      const post = await requireLikeablePost(scope, input.viewerId, input.postId);
      const removed = await scope.likes.remove(input.viewerId, post.id);
      const likeCount = removed ? await scope.likes.applyLikeCount(post.id, -1) : post.likeCount;
      return { liked: false, likeCount };
    });
  }
}

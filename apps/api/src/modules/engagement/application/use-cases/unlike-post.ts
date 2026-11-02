import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { LikeStatus } from '../../domain/like.ts';
import type { LikeTransaction } from '../ports/like-transaction.ts';
import { requireEngageablePost } from '../require-visible-post.ts';

/**
 * Ne plus aimer un post visible. Idempotent : `like_count` ne baisse que si le like est supprimé ;
 * post invisible ou supprimé → `post_not_found`, comme pour le like. La notification du like est
 * retirée dans la même transaction (ADR-026).
 */
export class UnlikePost {
  constructor(private readonly transaction: UnitOfWork<LikeTransaction>) {}

  execute(input: { viewerId: string; postId: string }): Promise<LikeStatus> {
    return this.transaction.run(async (scope) => {
      const post = await requireEngageablePost(scope, input.viewerId, input.postId);
      const removed = await scope.likes.remove(input.viewerId, post.id);
      if (!removed) return { liked: false, likeCount: post.likeCount };

      await scope.notifications.retract({
        recipientId: post.author.id,
        actorId: input.viewerId,
        type: 'like',
        postId: post.id,
      });
      return { liked: false, likeCount: await scope.likes.applyLikeCount(post.id, -1) };
    });
  }
}

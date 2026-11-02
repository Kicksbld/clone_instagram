import type { NotificationDispatcher } from '../../../../shared/application/notification-dispatcher.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { LikeStatus } from '../../domain/like.ts';
import type { LikeTransaction } from '../ports/like-transaction.ts';
import { requireEngageablePost } from '../require-visible-post.ts';

/**
 * Aimer un post visible (use case de référence d'ADR-005), y compris le sien. Idempotent :
 * `like_count` n'augmente que si le like est créé. L'auteur du post est notifié dans la même
 * transaction (ADR-026), la notification diffusée après elle.
 */
export class LikePost {
  constructor(
    private readonly transaction: UnitOfWork<LikeTransaction>,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: { viewerId: string; postId: string }): Promise<LikeStatus> {
    const { status, notification } = await this.transaction.run(async (scope) => {
      const post = await requireEngageablePost(scope, input.viewerId, input.postId);
      const created = await scope.likes.add(input.viewerId, post.id);
      if (!created)
        return { status: { liked: true, likeCount: post.likeCount }, notification: null };

      const likeCount = await scope.likes.applyLikeCount(post.id, 1);
      const notification = await scope.notifications.notify({
        recipientId: post.author.id,
        actorId: input.viewerId,
        type: 'like',
        postId: post.id,
      });
      return { status: { liked: true, likeCount }, notification };
    });
    if (notification) this.notifications.dispatch([notification]);
    return status;
  }
}

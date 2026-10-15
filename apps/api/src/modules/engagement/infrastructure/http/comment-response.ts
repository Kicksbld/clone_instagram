import type { components } from '@clone/contract';

import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { CommentView } from '../../domain/comment.ts';

export type CommentResponse = components['schemas']['Comment'];

/** Commentaire du domaine → schéma `Comment` du contrat (chemins Storage → URL publiques). */
export function toCommentResponse(comment: CommentView, urls: PublicMediaUrls): CommentResponse {
  const { avatarVariants } = comment.author;
  return {
    id: comment.id,
    postId: comment.postId,
    ...(comment.parentId && { parentId: comment.parentId }),
    author: {
      id: comment.author.id,
      username: comment.author.username,
      ...(avatarVariants && { avatar: urls.of(avatarVariants) }),
    },
    body: comment.body,
    replyCount: comment.replyCount,
    createdAt: comment.createdAt.toISOString(),
    viewerCanDelete: comment.viewerCanDelete,
  };
}

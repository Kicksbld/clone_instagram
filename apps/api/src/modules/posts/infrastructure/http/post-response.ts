import type { components } from '@clone/contract';

import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { Post } from '../../domain/post.ts';

export type PostResponse = components['schemas']['Post'];

/** Post du domaine → schéma `Post` du contrat (chemins Storage → URL publiques). */
export function toPostResponse(post: Post, urls: PublicMediaUrls): PostResponse {
  const { avatarVariants } = post.author;
  return {
    mentions: (post.mentions ?? []).map((user) => ({
      id: user.id,
      username: user.username,
      textUsername: user.textUsername ?? user.username,
      ...(user.avatarVariants && { avatar: urls.of(user.avatarVariants) }),
    })),
    id: post.id,
    kind: post.kind,
    caption: post.caption,
    author: {
      id: post.author.id,
      username: post.author.username,
      ...(avatarVariants && { avatar: urls.of(avatarVariants) }),
    },
    media: post.media.map((item) => ({
      variants: urls.of(item.variants),
      ...(item.altText && { altText: item.altText }),
      width: item.width,
      height: item.height,
      ...(item.durationMs !== undefined && { durationMs: item.durationMs }),
    })),
    likeCount: post.likeCount,
    viewerHasLiked: post.viewerHasLiked,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
  };
}

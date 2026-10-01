import type { components } from '@clone/contract';

import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { Post } from '../../domain/post.ts';

export type PostResponse = components['schemas']['Post'];

/** Post du domaine → schéma `Post` du contrat (chemins Storage → URL publiques). */
export function toPostResponse(post: Post, urls: PublicMediaUrls): PostResponse {
  if (post.kind !== 'post') throw new Error(`Valeur hors contrat : ${post.kind}`);
  const { avatarVariants } = post.author;
  return {
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
      width: item.width,
      height: item.height,
    })),
    createdAt: post.createdAt.toISOString(),
  };
}

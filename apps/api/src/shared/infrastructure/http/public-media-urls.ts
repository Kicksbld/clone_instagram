import type { components } from '@clone/contract';
import { STORAGE_BUCKETS } from '@clone/db';

import type { ImageVariantPaths } from '../../domain/image-variants.ts';

type ImageVariants = components['schemas']['ImageVariants'];

/** URL publiques des variantes (bucket `media-public`, ADR-008), lues directement par l'app. */
export interface PublicMediaUrls {
  of(paths: ImageVariantPaths): ImageVariants;
}

/** `baseUrl` : URL Supabase joignable depuis l'iPhone (`PUBLIC_MEDIA_BASE_URL`, ADR-009). */
export function publicMediaUrls(baseUrl: string): PublicMediaUrls {
  const url = (path: string) =>
    new URL(`/storage/v1/object/public/${STORAGE_BUCKETS.public}/${path}`, baseUrl).toString();
  return {
    of: (paths) => ({
      thumb: url(paths.thumb),
      medium: url(paths.medium),
      large: url(paths.large),
    }),
  };
}

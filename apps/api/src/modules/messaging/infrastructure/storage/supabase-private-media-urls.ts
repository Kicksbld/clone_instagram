import { STORAGE_BUCKETS } from '@clone/db';
import type { StorageClient } from '@supabase/storage-js';

import type { PrivateMediaUrls } from '../../application/ports/private-media-urls.ts';

/** Validity of a message photo URL (ADR-023): long enough to scroll, short enough to expire fast. */
export const SIGNED_URL_VALIDITY_SECONDS = 60 * 60;

/**
 * Signed URLs of `media-private` with the secret key (ADR-009). Rewritten on `publicBaseUrl`,
 * reachable from the iPhone, like upload URLs.
 */
export class SupabasePrivateMediaUrls implements PrivateMediaUrls {
  constructor(
    private readonly storage: StorageClient,
    private readonly publicBaseUrl: string,
    private readonly now: () => Date,
  ) {}

  async sign(path: string): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(this.now().getTime() + SIGNED_URL_VALIDITY_SECONDS * 1000);
    const { data, error } = await this.storage
      .from(STORAGE_BUCKETS.private)
      .createSignedUrl(path, SIGNED_URL_VALIDITY_SECONDS);
    if (error) throw new Error('URL signée non créée par Supabase Storage', { cause: error });

    const signed = new URL(data.signedUrl);
    return {
      url: new URL(`${signed.pathname}${signed.search}`, this.publicBaseUrl).toString(),
      expiresAt,
    };
  }
}

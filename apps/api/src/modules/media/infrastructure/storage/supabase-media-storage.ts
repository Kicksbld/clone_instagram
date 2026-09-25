import { STORAGE_BUCKETS } from '@clone/db';
import type { StorageClient } from '@supabase/storage-js';

import type { MediaStorage } from '../../application/ports/media-storage.ts';

/** Durée de validité fixe des URL d'upload signées de Supabase Storage (vérifiée en T3). */
const UPLOAD_URL_VALIDITY_MS = 2 * 60 * 60 * 1000;

/**
 * Supabase Storage avec la clé secrète (API et worker uniquement, ADR-009). L'URL d'upload est
 * réécrite sur `publicBaseUrl`, joignable depuis l'iPhone (l'API, elle, parle à `SUPABASE_URL`).
 */
export class SupabaseMediaStorage implements MediaStorage {
  constructor(
    private readonly storage: StorageClient,
    private readonly publicBaseUrl: string,
    private readonly now: () => Date,
  ) {}

  async createUploadUrl(path: string): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(this.now().getTime() + UPLOAD_URL_VALIDITY_MS);
    const { data, error } = await this.storage
      .from(STORAGE_BUCKETS.uploads)
      .createSignedUploadUrl(path);
    if (error) throw new Error('URL d’upload non créée par Supabase Storage', { cause: error });

    const signed = new URL(data.signedUrl);
    const url = new URL(`${signed.pathname}${signed.search}`, this.publicBaseUrl);
    return { url: url.toString(), expiresAt };
  }
}

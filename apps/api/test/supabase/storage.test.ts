import { existsSync } from 'node:fs';

import { STORAGE_BUCKETS } from '@clone/db';
import { StorageClient } from '@supabase/storage-js';
import { afterAll, describe, expect, it } from 'vitest';

import { SupabaseMediaStorage } from '../../src/modules/media/infrastructure/storage/supabase-media-storage.ts';
import { publicMediaUrls } from '../../src/shared/infrastructure/http/public-media-urls.ts';

/**
 * ADR-008 : upload présigné et URL publiques contre un Supabase réel, hors de `pnpm test`.
 * `pnpm test:supabase` vise le `.env` (Supabase CLI) ; pour la démo, passer `SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY` et `PUBLIC_MEDIA_BASE_URL` de Supabase Cloud dans la commande.
 */
const envFile = new URL('../../../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquante : la renseigner dans .env ou devant la commande`);
  return value;
}

const secretKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const publicBaseUrl = requiredEnv('PUBLIC_MEDIA_BASE_URL');
const client = new StorageClient(new URL('/storage/v1', requiredEnv('SUPABASE_URL')).toString(), {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
});
const storage = new SupabaseMediaStorage(client, publicBaseUrl, () => new Date());
const prefix = `test-supabase-${Date.now()}`;

afterAll(async () => {
  await client.from(STORAGE_BUCKETS.uploads).remove([`${prefix}/original`]);
  await client.from(STORAGE_BUCKETS.public).remove([`${prefix}/thumb.webp`]);
});

describe('Supabase Storage', () => {
  it('URL d’upload : un PUT du fichier brut, une seule fois, valable 2 h', async () => {
    const before = Date.now();
    const { url, expiresAt } = await storage.createUploadUrl(`${prefix}/original`);

    expect(url.startsWith(publicBaseUrl)).toBe(true);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 1000);

    const put = (body: string) =>
      fetch(url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body });
    expect((await put('contenu')).status).toBe(200);
    expect((await put('autre contenu')).ok).toBe(false);

    const { data } = await client.from(STORAGE_BUCKETS.uploads).download(`${prefix}/original`);
    expect(await data?.text()).toBe('contenu');
  });

  it('bucket uploads privé : pas de lecture publique de l’original', async () => {
    const response = await fetch(
      new URL(
        `/storage/v1/object/public/${STORAGE_BUCKETS.uploads}/${prefix}/original`,
        publicBaseUrl,
      ),
    );
    expect(response.ok).toBe(false);
  });

  it('variantes lisibles sans authentification par leur URL publique', async () => {
    const path = `${prefix}/thumb.webp`;
    await client
      .from(STORAGE_BUCKETS.public)
      .upload(path, new Blob(['webp']), { contentType: 'image/webp' });

    const { thumb } = publicMediaUrls(publicBaseUrl).of({ thumb: path, medium: path, large: path });
    const response = await fetch(thumb);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('webp');
  });
});

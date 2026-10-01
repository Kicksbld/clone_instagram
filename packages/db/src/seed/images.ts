// Images d'exemple du seed : photos de picsum.photos (graine fixe → même photo), reçues directement
// en WebP aux largeurs des variantes d'ADR-008, puis écrites dans le bucket public comme le ferait
// le worker. Aucune dépendance : `fetch` pour le téléchargement et l'API REST de Supabase Storage.
import { STORAGE_BUCKETS, type ImageVariantPaths } from '../schema/index.ts';
import { RATIOS, type PlannedMedia } from './plan.ts';

/** Largeurs des variantes WebP (ADR-008), les mêmes que celles du worker. */
const VARIANT_WIDTHS = { thumb: 150, medium: 640, large: 1080 } as const;
type VariantName = keyof typeof VARIANT_WIDTHS;
/**
 * Médias traités en parallèle : Supabase Cloud (offre gratuite) refuse au-delà de quelques écritures
 * Storage simultanées (`429 SlowDown`).
 */
const CONCURRENCY = 2;
/** Essais par requête, avec une attente qui double à chaque échec (1 s, 2 s, 4 s… 16 s au plus). */
const ATTEMPTS = 7;
const MAX_DELAY_MS = 16_000;

export interface StorageTarget {
  /** `SUPABASE_URL` (local ou démo). */
  supabaseUrl: string;
  serviceRoleKey: string;
}

/** Chemins des variantes dans `media-public`, comme `process-image`. */
export const variantPaths = (mediaId: string): ImageVariantPaths => ({
  thumb: `${mediaId}/thumb.webp`,
  medium: `${mediaId}/medium.webp`,
  large: `${mediaId}/large.webp`,
});

async function withRetry<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
      const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_DELAY_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Télécharge et écrit les variantes de chaque média ; renvoie la taille de la variante `large` par
 * média (colonne `size_bytes`). Écriture en `upsert` : une relance réécrit les mêmes chemins.
 */
export async function uploadSeedImages(
  items: readonly PlannedMedia[],
  storage: StorageTarget,
  onProgress: (done: number) => void,
): Promise<Map<string, number>> {
  // Une même photo sert à plusieurs médias : téléchargée une seule fois par taille.
  const downloads = new Map<string, Promise<ArrayBuffer>>();
  const download = (source: string, width: number, height: number) => {
    const url = `https://picsum.photos/seed/${source}/${width}/${height}.webp`;
    let pending = downloads.get(url);
    if (!pending) {
      pending = withRetry(async () => {
        const response = await fetch(url);
        if (!response.ok)
          throw new Error(`Image d'exemple indisponible (${response.status}) : ${url}`);
        return response.arrayBuffer();
      });
      downloads.set(url, pending);
    }
    return pending;
  };

  const upload = (path: string, body: ArrayBuffer) =>
    withRetry(async () => {
      const url = new URL(
        `/storage/v1/object/${STORAGE_BUCKETS.public}/${path}`,
        storage.supabaseUrl,
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: storage.serviceRoleKey,
          Authorization: `Bearer ${storage.serviceRoleKey}`,
          'Content-Type': 'image/webp',
          'x-upsert': 'true',
        },
        body,
      });
      if (!response.ok) {
        throw new Error(
          `Écriture de ${path} impossible (${response.status}) : ${await response.text()}`,
        );
      }
    });

  const sizes = new Map<string, number>();
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (let item = items[next++]; item; item = items[next++]) {
      const { width, height } = RATIOS[item.ratio];
      const paths = variantPaths(item.id);
      for (const name of Object.keys(VARIANT_WIDTHS) as VariantName[]) {
        const variantWidth = VARIANT_WIDTHS[name];
        const body = await download(
          item.source,
          variantWidth,
          Math.round((variantWidth * height) / width),
        );
        await upload(paths[name], body);
        if (name === 'large') sizes.set(item.id, body.byteLength);
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return sizes;
}

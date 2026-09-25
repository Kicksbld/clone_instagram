import type { StorageClient } from '@supabase/storage-js';

/** Supabase Storage vu par le worker (ADR-008) : lire l'original, écrire et effacer des fichiers. */
export interface WorkerStorage {
  /** `null` si le fichier n'existe pas. */
  download(bucket: string, path: string): Promise<Buffer | null>;
  /** Écrase un fichier existant : un job rejoué réécrit les mêmes chemins, sans doublon. */
  upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void>;
  /** Sans erreur pour un fichier déjà absent. */
  remove(bucket: string, paths: readonly string[]): Promise<void>;
}

/** Adapter storage-js avec la clé secrète (API et worker uniquement, ADR-009). */
export class SupabaseWorkerStorage implements WorkerStorage {
  constructor(private readonly client: StorageClient) {}

  async download(bucket: string, path: string): Promise<Buffer | null> {
    const { data, error } = await this.client.from(bucket).download(path);
    if (error) {
      if ('statusCode' in error && String(error.statusCode) === '404') return null;
      throw new Error(`Lecture de ${bucket}/${path} impossible`, { cause: error });
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client
      .from(bucket)
      .upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`Écriture de ${bucket}/${path} impossible`, { cause: error });
  }

  async remove(bucket: string, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.from(bucket).remove([...paths]);
    if (error) throw new Error(`Suppression dans ${bucket} impossible`, { cause: error });
  }
}

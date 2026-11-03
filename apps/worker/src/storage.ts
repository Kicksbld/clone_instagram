import { StorageClient } from '@supabase/storage-js';

/** Supabase Storage vu par le worker (ADR-008) : lire l'original, écrire et effacer des fichiers. */
export interface WorkerStorage {
  withSignal(signal: AbortSignal): WorkerStorage;
  /** Efface tous les objets sous le préfixe, y compris les sous-dossiers HLS. */
  removeDirectory(bucket: string, prefix: string): Promise<void>;
  /** `null` si le fichier n'existe pas. */
  download(bucket: string, path: string): Promise<Buffer | null>;
  /** Écrase un fichier existant : un job rejoué réécrit les mêmes chemins, sans doublon. */
  upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void>;
  /** Sans erreur pour un fichier déjà absent. */
  remove(bucket: string, paths: readonly string[]): Promise<void>;
}

/** Adapter storage-js avec la clé secrète (API et worker uniquement, ADR-009). */
export class SupabaseWorkerStorage implements WorkerStorage {
  private readonly client: StorageClient;
  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    signal?: AbortSignal,
  ) {
    this.client = new StorageClient(url, headers, (input, init) =>
      fetch(input, {
        ...init,
        ...(signal && { signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal }),
      }),
    );
  }

  withSignal(signal: AbortSignal): WorkerStorage {
    return new SupabaseWorkerStorage(this.url, this.headers, signal);
  }

  async removeDirectory(bucket: string, prefix: string): Promise<void> {
    // List from the start after each deletion: offsets would skip objects as the directory shrinks.
    for (;;) {
      const { data, error } = await this.client.from(bucket).list(prefix, { limit: 100 });
      if (error) throw new Error(`Liste de ${bucket}/${prefix} impossible`, { cause: error });
      if (!data.length) return;
      const files: string[] = [];
      for (const item of data) {
        if (item.id !== null) files.push(`${prefix}/${item.name}`);
        else await this.removeDirectory(bucket, `${prefix}/${item.name}`);
      }
      await this.remove(bucket, files);
    }
  }

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

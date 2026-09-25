import type { WorkerStorage } from '../../src/storage.ts';

/** Storage en mémoire : fichiers indexés par `bucket/chemin`. */
export class InMemoryStorage implements WorkerStorage {
  readonly files = new Map<string, { data: Buffer; contentType: string }>();
  /** Nombre d'écritures, pour vérifier qu'un job rejoué ne duplique rien. */
  uploads = 0;
  failUploads = false;

  put(bucket: string, path: string, data: Buffer): void {
    this.files.set(`${bucket}/${path}`, { data, contentType: 'application/octet-stream' });
  }

  has(bucket: string, path: string): boolean {
    return this.files.has(`${bucket}/${path}`);
  }

  get(bucket: string, path: string): Buffer | undefined {
    return this.files.get(`${bucket}/${path}`)?.data;
  }

  download(bucket: string, path: string): Promise<Buffer | null> {
    return Promise.resolve(this.get(bucket, path) ?? null);
  }

  upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void> {
    if (this.failUploads) return Promise.reject(new Error('Storage indisponible'));
    this.uploads++;
    this.files.set(`${bucket}/${path}`, { data, contentType });
    return Promise.resolve();
  }

  remove(bucket: string, paths: readonly string[]): Promise<void> {
    for (const path of paths) this.files.delete(`${bucket}/${path}`);
    return Promise.resolve();
  }
}

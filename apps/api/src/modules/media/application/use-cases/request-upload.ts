import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import { ProfileNotFoundError } from '../../../identity/domain/errors.ts';
import { originalPathFor, type MediaKind, type MediaPurpose } from '../../domain/media.ts';
import type { MediaRepository } from '../ports/media-repository.ts';
import type { MediaStorage } from '../ports/media-storage.ts';

export interface RequestUploadInput {
  userId: string;
  /** Types, taille et usages acceptés : garantis par le contrat (T3 : image JPEG / PNG ≤ 20 Mo, avatar). */
  kind: MediaKind;
  purpose: MediaPurpose;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadIntent {
  mediaId: string;
  uploadUrl: string;
  expiresAt: Date;
}

/** Intention d'upload (ADR-008) : média `pending_upload` et URL présignée vers `uploads`. */
export class RequestUpload {
  constructor(
    private readonly media: MediaRepository,
    private readonly storage: MediaStorage,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: RequestUploadInput): Promise<UploadIntent> {
    const id = this.ids.next();
    const originalPath = originalPathFor(input.userId, id);
    const created = await this.media.create({
      id,
      ownerId: input.userId,
      kind: input.kind,
      purpose: input.purpose,
      originalPath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    if (!created) throw new ProfileNotFoundError();

    const { url, expiresAt } = await this.storage.createUploadUrl(originalPath);
    return { mediaId: id, uploadUrl: url, expiresAt };
  }
}

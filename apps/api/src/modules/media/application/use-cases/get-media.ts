import { MediaNotFoundError } from '../../domain/errors.ts';
import { isOwnedBy, type Media } from '../../domain/media.ts';
import type { MediaRepository } from '../ports/media-repository.ts';

/** Statut et variantes d'un de mes médias ; celui d'un autre est introuvable. */
export class GetMedia {
  constructor(private readonly media: MediaRepository) {}

  async execute(input: { userId: string; mediaId: string }): Promise<Media> {
    const media = await this.media.findById(input.mediaId);
    if (!isOwnedBy(media, input.userId)) throw new MediaNotFoundError();
    return media;
  }
}

import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { ImageVariantPaths } from '../../../../shared/domain/image-variants.ts';
import { NotFoundError } from '../../../../shared/domain/errors.ts';
import { MediaNotFoundError } from '../../../media/domain/errors.ts';
import { requireConversation } from '../access.ts';
import type { MessagingRepository } from '../ports/messaging-repository.ts';
import type { PrivateMediaUrls } from '../ports/private-media-urls.ts';

/**
 * Signed URL of a message photo (ADR-023): only for a member of the conversation where it is
 * attached, while that conversation is visible to them (`canMessage`). Otherwise 404.
 */
export class GetMessagePhotoUrl {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly relationships: RelationshipReader,
    private readonly urls: PrivateMediaUrls,
  ) {}

  async execute(input: { viewerId: string; mediaId: string; variant: keyof ImageVariantPaths }) {
    const photo = await this.repository.findMessagePhoto(input.mediaId);
    if (!photo) throw new MediaNotFoundError();
    try {
      await requireConversation(
        this.repository,
        this.relationships,
        input.viewerId,
        photo.conversationId,
      );
    } catch (error) {
      // Hide the conversation as well: an invisible photo is simply not found (ADR-006).
      if (error instanceof NotFoundError) throw new MediaNotFoundError();
      throw error;
    }
    return this.urls.sign(photo.variants[input.variant]);
  }
}

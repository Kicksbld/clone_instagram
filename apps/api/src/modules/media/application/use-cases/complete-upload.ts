import type { JobQueue } from '../../../../shared/application/job-queue.ts';
import { MediaInvalidTransitionError, MediaNotFoundError } from '../../domain/errors.ts';
import { isOwnedBy, type Media } from '../../domain/media.ts';
import type { MediaRepository } from '../ports/media-repository.ts';

/**
 * Le fichier est envoyé : `pending_upload → uploaded`, puis traitement par le worker (ADR-008).
 * Rappelé sur un média `uploaded` (enfilage perdu, réponse non reçue), relance le traitement sans doublon.
 */
export class CompleteUpload {
  constructor(
    private readonly media: MediaRepository,
    private readonly jobs: JobQueue,
  ) {}

  async execute(input: { userId: string; mediaId: string }): Promise<Media> {
    const media = await this.media.findById(input.mediaId);
    if (!isOwnedBy(media, input.userId)) throw new MediaNotFoundError();

    if (media.status === 'pending_upload') {
      if (!(await this.media.markUploaded(media.id))) throw new MediaInvalidTransitionError();
    } else if (media.status !== 'uploaded') {
      throw new MediaInvalidTransitionError();
    }

    await this.jobs.enqueueImageProcessing(media.id);
    return { ...media, status: 'uploaded' };
  }
}

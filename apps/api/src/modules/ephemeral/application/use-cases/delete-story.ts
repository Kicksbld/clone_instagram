import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { StoryNotFoundError } from '../../domain/errors.ts';
import type { DeleteStoryTransaction } from '../ports/story-transactions.ts';

/**
 * Supprimer une de mes stories, active ou expirée (ADR-025) : suppression logique et média détaché
 * (puis purgé, ADR-008) dans une transaction. Story inexistante, déjà supprimée ou d'un autre auteur
 * → `story_not_found`, jamais `403` (ADR-006).
 */
export class DeleteStory {
  constructor(private readonly transaction: UnitOfWork<DeleteStoryTransaction>) {}

  execute(input: { authorId: string; storyId: string }): Promise<void> {
    return this.transaction.run(async ({ media, stories }) => {
      const deleted = await stories.softDelete(input.storyId, input.authorId);
      if (!deleted) throw new StoryNotFoundError();
      if (deleted.mediaId) await media.detach(deleted.mediaId);
    });
  }
}

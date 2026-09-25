import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { PostNotFoundError } from '../../domain/errors.ts';
import type { DeletePostTransaction } from '../ports/delete-post-transaction.ts';

/**
 * Supprimer un de mes posts (ADR-007) : suppression logique, médias détachés (puis purgés, ADR-008)
 * et `post_count` décrémenté, dans une transaction. Post inexistant, déjà supprimé ou d'un autre
 * auteur → `404 post_not_found`, jamais `403` (ADR-006).
 */
export class DeletePost {
  constructor(private readonly transaction: UnitOfWork<DeletePostTransaction>) {}

  execute(input: { authorId: string; postId: string }): Promise<void> {
    return this.transaction.run(async ({ media, posts }) => {
      const mediaIds = await posts.softDelete(input.postId, input.authorId);
      if (!mediaIds) throw new PostNotFoundError();

      for (const mediaId of mediaIds) await media.detach(mediaId);
      await posts.decrementPostCount(input.authorId);
    });
  }
}

import { NotFoundError } from '../../../shared/domain/errors.ts';

/** Story inexistante, supprimée, expirée ou invisible pour l'appelant : 404, jamais 403 (ADR-006). */
export class StoryNotFoundError extends NotFoundError {
  constructor() {
    super('story_not_found', 'Cette story n’existe pas ou n’est plus disponible.');
  }
}

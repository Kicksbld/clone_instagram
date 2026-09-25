import { BadRequestError, NotFoundError } from '../../../shared/domain/errors.ts';

/** Post inexistant, supprimé ou invisible pour l'appelant : 404, jamais 403 (ADR-006). */
export class PostNotFoundError extends NotFoundError {
  constructor() {
    super('post_not_found', 'Ce post n’existe pas ou n’est pas disponible.');
  }
}

/** Déjà refusé par le contrat ; revérifié par le domaine. */
export class CaptionTooLongError extends BadRequestError {
  constructor() {
    super('validation_failed', 'La légende dépasse 2 200 caractères.');
  }
}

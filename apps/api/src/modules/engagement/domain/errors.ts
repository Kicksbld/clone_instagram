import {
  BadRequestError,
  BusinessRuleError,
  NotFoundError,
} from '../../../shared/domain/errors.ts';

/**
 * Commentaire inexistant, supprimé ou invisible pour l'appelant, parent d'un autre post, ou
 * suppression par quelqu'un qui n'en a pas le droit : 404, jamais 403 (ADR-006).
 */
export class CommentNotFoundError extends NotFoundError {
  constructor() {
    super('comment_not_found', 'Ce commentaire n’existe pas ou n’est pas disponible.');
  }
}

/** Un seul niveau de réponse : on ne répond pas à une réponse. */
export class ReplyToReplyError extends BusinessRuleError {
  constructor() {
    super('reply_to_reply', 'On ne peut pas répondre à une réponse.');
  }
}

/** Déjà refusé par le contrat ; revérifié par le domaine. */
export class InvalidCommentBodyError extends BadRequestError {
  constructor() {
    super('validation_failed', 'Le commentaire doit contenir de 1 à 2 200 caractères.');
  }
}

import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors.ts';

/** On ne peut ni se suivre, ni ne plus se suivre, ni se retirer de ses abonnés soi-même (ADR-006). */
export class CannotFollowSelfError extends BusinessRuleError {
  constructor() {
    super('cannot_follow_self', 'Vous ne pouvez pas vous suivre vous-même.');
  }
}

/**
 * Demande d'abonnement inexistante (annulée, déjà acceptée ou refusée) ou dont le demandeur est
 * devenu invisible (ADR-006).
 */
export class FollowRequestNotFoundError extends NotFoundError {
  constructor() {
    super('follow_request_not_found', "Cette demande d'abonnement n'existe plus.");
  }
}

/** On ne peut ni se bloquer ni se débloquer soi-même (ADR-006). */
export class CannotBlockSelfError extends BusinessRuleError {
  constructor() {
    super('cannot_block_self', 'Vous ne pouvez pas vous bloquer vous-même.');
  }
}

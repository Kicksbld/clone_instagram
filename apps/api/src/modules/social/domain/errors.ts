import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors.ts';

/** On ne peut ni se suivre ni ne plus se suivre soi-même (ADR-006). */
export class CannotFollowSelfError extends BusinessRuleError {
  constructor() {
    super('cannot_follow_self', 'Vous ne pouvez pas vous suivre vous-même.');
  }
}

/**
 * Suivre un compte privé est refusé en P0 (D32) ; les demandes d'abonnement arrivent en P1. 403 et
 * non 404 : le profil d'un compte privé reste visible (ADR-006).
 */
export class AccountPrivateError extends ForbiddenError {
  constructor() {
    super('account_private', 'Ce compte est privé : il ne peut pas encore être suivi.');
  }
}

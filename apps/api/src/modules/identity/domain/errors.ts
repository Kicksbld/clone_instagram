import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors.ts';

/** L'utilisateur authentifié n'a pas encore de profil (onboarding non terminé). */
export class ProfileNotFoundError extends NotFoundError {
  constructor() {
    super('profile_not_found', 'Aucun profil : l’onboarding n’est pas terminé.');
  }
}

/** Profil inexistant ou invisible pour l'appelant : 404, jamais 403 (ADR-006). */
export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('user_not_found', 'Ce profil n’existe pas ou n’est pas disponible.');
  }
}

export class UsernameTakenError extends ConflictError {
  constructor() {
    super('username_taken', 'Ce nom d’utilisateur est déjà pris.');
  }
}

export class ProfileAlreadyExistsError extends ConflictError {
  constructor() {
    super('profile_already_exists', 'Le profil a déjà été créé.');
  }
}

export class AgeRequirementNotMetError extends BusinessRuleError {
  constructor() {
    super('age_requirement_not_met', 'Il faut avoir au moins 13 ans pour créer un compte.');
  }
}

/** Le statut actuel du compte ne permet pas l'action d'administration (T14). */
export class InvalidStatusTransitionError extends ConflictError {
  constructor() {
    super('invalid_status_transition', 'Le statut actuel du compte ne permet pas cette action.');
  }
}

/** Un admin ne peut ni se suspendre, ni se bannir, ni se réactiver, ni se supprimer lui-même. */
export class CannotModerateSelfError extends BusinessRuleError {
  constructor() {
    super(
      'cannot_moderate_self',
      'Vous ne pouvez pas appliquer cette action à votre propre compte.',
    );
  }
}

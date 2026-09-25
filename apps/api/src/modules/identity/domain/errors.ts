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

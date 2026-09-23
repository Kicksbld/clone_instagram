/**
 * Erreurs métier typées (ADR-005), converties en Problem Details par le gestionnaire unique.
 * `code` est stable et documenté dans le contrat (ADR-003).
 */
export abstract class DomainError extends Error {
  abstract readonly kind: 'not_found' | 'forbidden' | 'conflict' | 'business_rule';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Ressource absente ou invisible pour l'appelant (404, jamais 403 : ADR-006). */
export class NotFoundError extends DomainError {
  readonly kind = 'not_found';
}

export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden';
}

export class ConflictError extends DomainError {
  readonly kind = 'conflict';
}

/** Règle métier non respectée (422). */
export class BusinessRuleError extends DomainError {
  readonly kind = 'business_rule';
}

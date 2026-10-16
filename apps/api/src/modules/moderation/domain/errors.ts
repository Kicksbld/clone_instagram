import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors.ts';

/** On ne se signale pas soi-même, ni son propre post ou commentaire. */
export class CannotReportSelfError extends BusinessRuleError {
  constructor() {
    super('cannot_report_self', 'Vous ne pouvez pas signaler votre propre compte ou contenu.');
  }
}

/** Signalement inexistant (backoffice). */
export class ReportNotFoundError extends NotFoundError {
  constructor() {
    super('report_not_found', 'Signalement introuvable.');
  }
}

/** Le signalement a déjà été traité, seul ou avec les autres signalements du même contenu. */
export class ReportAlreadyResolvedError extends ConflictError {
  constructor() {
    super('report_already_resolved', 'Ce signalement a déjà été traité.');
  }
}

/** Un compte signalé ne se supprime pas depuis la file : seul le classement est possible. */
export class CannotRemoveUserError extends BusinessRuleError {
  constructor() {
    super(
      'cannot_remove_user',
      'Un compte signalé ne peut être que classé ; sanctionnez-le depuis sa fiche.',
    );
  }
}

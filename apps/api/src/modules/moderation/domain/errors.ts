import { BusinessRuleError } from '../../../shared/domain/errors.ts';

/** On ne se signale pas soi-même, ni son propre post ou commentaire. */
export class CannotReportSelfError extends BusinessRuleError {
  constructor() {
    super('cannot_report_self', 'Vous ne pouvez pas signaler votre propre compte ou contenu.');
  }
}

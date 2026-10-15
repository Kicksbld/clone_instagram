import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { DomainError } from '../../../../shared/domain/errors.ts';
import {
  canViewContent,
  canViewProfile,
  type VisibilitySubject,
} from '../../../../shared/domain/visibility.ts';
import { CommentNotFoundError } from '../../../engagement/domain/errors.ts';
import { ProfileNotFoundError, UserNotFoundError } from '../../../identity/domain/errors.ts';
import { PostNotFoundError } from '../../../posts/domain/errors.ts';
import { CannotReportSelfError } from '../../domain/errors.ts';
import { normalizeDetails, type ReportReason, type ReportTarget } from '../../domain/report.ts';
import type { ReportRepository } from '../ports/report-repository.ts';
import type { ReportTargetReader } from '../ports/report-target-reader.ts';

export interface CreateReportInput {
  reporterId: string;
  target: ReportTarget;
  reason: ReportReason;
  details?: string;
}

/**
 * Signaler un post, un commentaire ou un compte (statut `open`, traité au backoffice). La cible doit
 * être visible pour l'appelant (ADR-006), sinon 404 du type de la cible ; on ne signale ni soi-même
 * ni son propre contenu. Un même contenu peut être signalé plusieurs fois.
 */
export class CreateReport {
  constructor(
    private readonly targets: ReportTargetReader,
    private readonly relationships: RelationshipReader,
    private readonly reports: ReportRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateReportInput): Promise<{ id: string }> {
    const { reporterId, target } = input;
    if (!(await this.targets.findUser(reporterId))) throw new ProfileNotFoundError();
    await this.requireReportable(reporterId, target);

    const id = this.ids.next();
    await this.reports.create({
      id,
      reporterId,
      target,
      reason: input.reason,
      details: normalizeDetails(input.details),
    });
    return { id };
  }

  private async requireReportable(reporterId: string, target: ReportTarget): Promise<void> {
    switch (target.type) {
      case 'post': {
        const author = await this.targets.findPostAuthor(target.id);
        await this.require(reporterId, author, canViewContent, () => new PostNotFoundError());
        return;
      }
      case 'comment': {
        const comment = await this.targets.findComment(target.id);
        const notFound = () => new CommentNotFoundError();
        if (!comment) throw notFound();
        // Le commentaire d'un autre sur mon post reste signalable : seul son auteur compte.
        if (comment.postAuthor.id !== reporterId) {
          await this.require(reporterId, comment.postAuthor, canViewContent, notFound);
        }
        await this.require(reporterId, comment.author, canViewProfile, notFound);
        return;
      }
      case 'user': {
        const user = await this.targets.findUser(target.id);
        await this.require(reporterId, user, canViewProfile, () => new UserNotFoundError());
        return;
      }
    }
  }

  /** Cible visible et pas à moi ; invisible → `notFound`, à moi → `cannot_report_self`. */
  private async require(
    reporterId: string,
    owner: VisibilitySubject | null,
    canView: typeof canViewProfile,
    notFound: () => DomainError,
  ): Promise<void> {
    if (!owner) throw notFound();
    if (owner.id === reporterId) throw new CannotReportSelfError();
    const relation = await this.relationships.between(reporterId, owner.id);
    if (!canView(reporterId, owner, relation)) throw notFound();
  }
}

import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { ProfileRepository } from '../../../identity/application/ports/profile-repository.ts';
import type { Profile } from '../../../identity/domain/profile.ts';
import { ReportNotFoundError } from '../../domain/errors.ts';
import type { AdminReport } from '../../domain/report.ts';
import type {
  AdminReportedComment,
  AdminReportedPost,
  AdminReportReader,
} from '../ports/admin-report-reader.ts';

/** Détail d'un signalement : un seul contenu est renseigné, selon le type de la cible. */
export interface AdminReportDetail {
  report: AdminReport;
  /** Autres signalements ouverts sur le même contenu, traités en même temps. */
  otherOpenCount: number;
  post: AdminReportedPost | null;
  comment: AdminReportedComment | null;
  /** `null` si le compte a été supprimé. */
  user: Profile | null;
}

/**
 * Détail d'un signalement du backoffice (T15), avec l'aperçu du contenu visé, même privé ou
 * supprimé : un admin n'est pas un lecteur de l'app (pas de politique de visibilité).
 */
export class GetReportForAdmin {
  constructor(
    private readonly roles: AdminRoles,
    private readonly reports: AdminReportReader,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(input: { adminId: string; reportId: string }): Promise<AdminReportDetail> {
    await requireAdmin(this.roles, input.adminId);
    const report = await this.reports.findById(input.reportId);
    if (!report) throw new ReportNotFoundError();
    const { target } = report;

    const [otherOpenCount, post, comment, user] = await Promise.all([
      this.reports.countOpen(target, report.id),
      target.type === 'post' ? this.reports.findPost(target.id) : null,
      target.type === 'comment' ? this.reports.findComment(target.id) : null,
      target.type === 'user' ? this.profiles.findById(target.id) : null,
    ]);
    return {
      report,
      otherOpenCount,
      post,
      comment,
      user: user && user.status !== 'deleted' ? user : null,
    };
  }
}

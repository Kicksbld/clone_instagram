import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { ReportReason, ReportStatus, ReportTargetType } from '../../domain/report.ts';
import type { AdminReportReader, AdminReportSummary } from '../ports/admin-report-reader.ts';

export const ADMIN_REPORTS_PAGE_SIZE = 20;

/**
 * File des signalements du backoffice (T15) : ouverts par défaut, filtrés par motif et type de
 * contenu, par pages de 20 du plus récent au plus ancien.
 */
export class ListReportsForAdmin {
  constructor(
    private readonly roles: AdminRoles,
    private readonly reports: AdminReportReader,
  ) {}

  async execute(input: {
    adminId: string;
    status?: ReportStatus;
    reason?: ReportReason;
    targetType?: ReportTargetType;
    after: PageCursor | null;
  }): Promise<Page<AdminReportSummary>> {
    await requireAdmin(this.roles, input.adminId);
    return this.reports.list({
      status: input.status ?? 'open',
      reason: input.reason ?? null,
      targetType: input.targetType ?? null,
      after: input.after,
      limit: ADMIN_REPORTS_PAGE_SIZE,
    });
  }
}

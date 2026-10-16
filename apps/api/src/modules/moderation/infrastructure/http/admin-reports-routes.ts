import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import { toAdminUserSummary } from '../../../identity/infrastructure/http/admin-user-summary.ts';
import type { ReportedAuthor } from '../../application/ports/admin-report-reader.ts';
import type {
  AdminReportDetail,
  GetReportForAdmin,
} from '../../application/use-cases/get-report-for-admin.ts';
import type { ListReportsForAdmin } from '../../application/use-cases/list-reports-for-admin.ts';
import type { ResolveReport } from '../../application/use-cases/resolve-report.ts';
import type {
  AdminReport,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '../../domain/report.ts';

export interface AdminReportsUseCases {
  listReports: ListReportsForAdmin;
  getReport: GetReportForAdmin;
  resolveReport: ResolveReport;
}

type AdminReportResponse = components['schemas']['AdminReport'];
type AdminReportPage = components['schemas']['AdminReportPage'];
type AdminReportDetailResponse = components['schemas']['AdminReportDetail'];
type PostAuthor = components['schemas']['PostAuthor'];
type ResolveReportRequest = components['schemas']['ResolveReportRequest'];

/**
 * Modération du backoffice (T15, ADR-011) : authentifiées par le scope `/v1` ; le rôle `admin` est
 * vérifié par chaque use case (ADR-005).
 */
export function registerAdminReportsRoutes(
  app: FastifyInstance,
  useCases: AdminReportsUseCases,
  urls: PublicMediaUrls,
): void {
  const toReport = (report: AdminReport): AdminReportResponse => ({
    id: report.id,
    targetType: report.target.type,
    targetId: report.target.id,
    reason: report.reason,
    ...(report.details !== null && { details: report.details }),
    status: report.status,
    reporter: report.reporter,
    createdAt: report.createdAt.toISOString(),
  });

  const toAuthor = ({ id, username, avatarVariants }: ReportedAuthor): PostAuthor => ({
    id,
    username,
    ...(avatarVariants && { avatar: urls.of(avatarVariants) }),
  });

  const toDetail = (detail: AdminReportDetail): AdminReportDetailResponse => {
    const { report, post, comment, user } = detail;
    return {
      ...toReport(report),
      ...(report.resolvedAt && { resolvedAt: report.resolvedAt.toISOString() }),
      ...(report.resolutionNote !== null && { resolutionNote: report.resolutionNote }),
      otherOpenCount: detail.otherOpenCount,
      ...(post && {
        post: {
          id: post.id,
          author: toAuthor(post.author),
          caption: post.caption,
          media: post.media.map(({ variants, width, height }) => ({
            variants: urls.of(variants),
            width,
            height,
          })),
          createdAt: post.createdAt.toISOString(),
          removed: post.removed,
        },
      }),
      ...(comment && {
        comment: {
          id: comment.id,
          postId: comment.postId,
          author: toAuthor(comment.author),
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          removed: comment.removed,
        },
      }),
      ...(user && { user: toAdminUserSummary(user, urls) }),
    };
  };

  app.get<{
    Querystring: {
      status?: ReportStatus;
      reason?: ReportReason;
      targetType?: ReportTargetType;
      cursor?: string;
    };
  }>(
    '/v1/admin/reports',
    { schema: routeSchemaFor('listAdminReports') },
    async (request): Promise<AdminReportPage> => {
      const { status, reason, targetType, cursor } = request.query;
      const page = await useCases.listReports.execute({
        adminId: authenticatedUserId(request),
        ...(status && { status }),
        ...(reason && { reason }),
        ...(targetType && { targetType }),
        after: parseCursor(cursor),
      });
      return {
        items: page.items.map(({ excerpt, ...report }) => ({
          ...toReport(report),
          ...(excerpt !== null && { excerpt }),
        })),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/admin/reports/:id',
    { schema: routeSchemaFor('getAdminReport') },
    async (request): Promise<AdminReportDetailResponse> => {
      const detail = await useCases.getReport.execute({
        adminId: authenticatedUserId(request),
        reportId: request.params.id,
      });
      return toDetail(detail);
    },
  );

  app.post<{ Params: { id: string }; Body: ResolveReportRequest }>(
    '/v1/admin/reports/:id/resolve',
    { schema: routeSchemaFor('resolveAdminReport') },
    async (request): Promise<AdminReportDetailResponse> => {
      const adminId = authenticatedUserId(request);
      const reportId = request.params.id;
      await useCases.resolveReport.execute({
        adminId,
        reportId,
        action: request.body.action,
        ...(request.body.note !== undefined && { note: request.body.note }),
      });
      return toDetail(await useCases.getReport.execute({ adminId, reportId }));
    },
  );
}

import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import type { Page } from '../../../../shared/domain/pagination.ts';
import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { GetPlan } from '../../../billing/application/use-cases/get-plan.ts';
import type { UserReportList } from '../../application/ports/user-reports-reader.ts';
import type { DeleteUserAsAdmin } from '../../application/use-cases/delete-user-as-admin.ts';
import type { GetAdminSession } from '../../application/use-cases/get-admin-session.ts';
import type { GetUserForAdmin } from '../../application/use-cases/get-user-for-admin.ts';
import type { ListUsersForAdmin } from '../../application/use-cases/list-users-for-admin.ts';
import type { ModerateUser } from '../../application/use-cases/moderate-user.ts';
import type { ModeratedStatus, ModerationAction } from '../../domain/account-moderation.ts';
import { UserNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';

export interface AdminUsersUseCases {
  getAdminSession: GetAdminSession;
  listUsers: ListUsersForAdmin;
  getUser: GetUserForAdmin;
  moderateUser: ModerateUser;
  deleteUser: DeleteUserAsAdmin;
  /** Module `billing` : plan Clone Plus de la fiche (ADR-012). */
  getPlan: GetPlan;
}

type AdminSession = components['schemas']['AdminSession'];
type AdminUserSummary = components['schemas']['AdminUserSummary'];
type AdminUserPage = components['schemas']['AdminUserPage'];
type AdminUserDetail = components['schemas']['AdminUserDetail'];
type AdminReportList = components['schemas']['AdminReportList'];
type AdminActionRequest = components['schemas']['AdminActionRequest'];

const MODERATION_ROUTES: readonly [ModerationAction, string][] = [
  ['suspend', 'suspendAdminUser'],
  ['ban', 'banAdminUser'],
  ['reactivate', 'reactivateAdminUser'],
];

/**
 * Routes d'administration (backoffice, ADR-011) : authentifiées par le scope `/v1` ; le rôle `admin`
 * est vérifié par chaque use case (ADR-005).
 */
export function registerAdminUsersRoutes(
  app: FastifyInstance,
  useCases: AdminUsersUseCases,
  urls: PublicMediaUrls,
): void {
  const toSummary = (profile: Profile): AdminUserSummary => {
    // Un compte supprimé n'est jamais renvoyé (les use cases le traitent comme introuvable).
    if (profile.status === 'deleted') throw new UserNotFoundError();
    return {
      id: profile.id,
      username: profile.username,
      fullName: profile.fullName,
      status: profile.status,
      ...(profile.avatar && { avatar: urls.of(profile.avatar.variants) }),
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      postCount: profile.postCount,
      createdAt: profile.createdAt.toISOString(),
    };
  };

  const toReportList = ({ total, items }: UserReportList): AdminReportList => ({
    total,
    items: items.map(({ details, createdAt, ...report }) => ({
      ...report,
      ...(details !== null && { details }),
      createdAt: createdAt.toISOString(),
    })),
  });

  app.get(
    '/v1/admin/me',
    { schema: routeSchemaFor('getAdminSession') },
    async (request): Promise<AdminSession> => {
      return useCases.getAdminSession.execute({ userId: authenticatedUserId(request) });
    },
  );

  app.get<{ Querystring: { q?: string; status?: ModeratedStatus; cursor?: string } }>(
    '/v1/admin/users',
    { schema: routeSchemaFor('listAdminUsers') },
    async (request): Promise<AdminUserPage> => {
      const page: Page<Profile> = await useCases.listUsers.execute({
        adminId: authenticatedUserId(request),
        ...(request.query.q !== undefined && { query: request.query.q }),
        ...(request.query.status && { status: request.query.status }),
        after: parseCursor(request.query.cursor),
      });
      return {
        items: page.items.map(toSummary),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/admin/users/:id',
    { schema: routeSchemaFor('getAdminUser') },
    async (request): Promise<AdminUserDetail> => {
      const file = await useCases.getUser.execute({
        adminId: authenticatedUserId(request),
        userId: request.params.id,
      });
      const { plan, expiresAt } = await useCases.getPlan.execute({ userId: file.profile.id });
      return {
        ...toSummary(file.profile),
        bio: file.profile.bio,
        isPrivate: file.profile.isPrivate,
        plan,
        ...(expiresAt && { plusExpiresAt: expiresAt.toISOString() }),
        reportsReceived: toReportList(file.reportsReceived),
        reportsFiled: toReportList(file.reportsFiled),
      };
    },
  );

  for (const [action, operationId] of MODERATION_ROUTES) {
    app.post<{ Params: { id: string }; Body: AdminActionRequest }>(
      `/v1/admin/users/:id/${action}`,
      { schema: routeSchemaFor(operationId) },
      async (request): Promise<AdminUserSummary> => {
        const profile = await useCases.moderateUser.execute({
          adminId: authenticatedUserId(request),
          userId: request.params.id,
          action,
          reason: request.body.reason,
        });
        return toSummary(profile);
      },
    );
  }

  app.delete<{ Params: { id: string }; Body: AdminActionRequest }>(
    '/v1/admin/users/:id',
    { schema: routeSchemaFor('deleteAdminUser') },
    async (request, reply): Promise<void> => {
      await useCases.deleteUser.execute({
        adminId: authenticatedUserId(request),
        userId: request.params.id,
        reason: request.body.reason,
      });
      reply.status(204);
    },
  );
}

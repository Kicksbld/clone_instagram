import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import { type ModeratedStatus, normalizeAdminSearch } from '../../domain/account-moderation.ts';
import type { Profile } from '../../domain/profile.ts';
import type { AdminUserReader } from '../ports/admin-user-reader.ts';

export const ADMIN_USERS_PAGE_SIZE = 20;

/**
 * Recherche d'utilisateurs du backoffice (T14) : username ou nom partiel, statut, par pages de 20 du
 * plus récent au plus ancien. Un admin voit tous les comptes non supprimés, sans politique de
 * visibilité (il n'est pas un lecteur de l'app).
 */
export class ListUsersForAdmin {
  constructor(
    private readonly roles: AdminRoles,
    private readonly users: AdminUserReader,
  ) {}

  async execute(input: {
    adminId: string;
    query?: string;
    status?: ModeratedStatus;
    after: PageCursor | null;
  }): Promise<Page<Profile>> {
    await requireAdmin(this.roles, input.adminId);
    const search = normalizeAdminSearch(input.query);
    if (search === undefined) return { items: [], next: null };
    return this.users.list({
      search,
      status: input.status ?? null,
      after: input.after,
      limit: ADMIN_USERS_PAGE_SIZE,
    });
  }
}

import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { AdminRole } from '../../../../shared/domain/admin.ts';

/** Session du backoffice (T14) : l'appelant a-t-il le rôle `admin` ? Sinon `403 admin_required`. */
export class GetAdminSession {
  constructor(private readonly roles: AdminRoles) {}

  async execute(input: { userId: string }): Promise<{ id: string; role: AdminRole }> {
    await requireAdmin(this.roles, input.userId);
    return { id: input.userId, role: 'admin' };
  }
}

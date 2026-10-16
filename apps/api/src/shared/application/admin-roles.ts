import { AdminRequiredError } from '../domain/admin.ts';

/** Rôles d'administration (table `admin_roles`), lus par chaque use case d'administration (ADR-011). */
export interface AdminRoles {
  isAdmin(userId: string): Promise<boolean>;
}

/** Autorisation d'un use case d'administration : le use case décide (ADR-005), jamais la route. */
export async function requireAdmin(roles: AdminRoles, userId: string): Promise<void> {
  if (!(await roles.isAdmin(userId))) throw new AdminRequiredError();
}

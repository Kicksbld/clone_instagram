import { adminRoles, type Executor } from '@clone/db';
import { and, eq } from 'drizzle-orm';

import type { AdminRoles } from '../../application/admin-roles.ts';

/** Rôle lu sur la clé primaire de `admin_roles`. */
export class DrizzleAdminRoles implements AdminRoles {
  constructor(private readonly db: Executor) {}

  async isAdmin(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: adminRoles.userId })
      .from(adminRoles)
      .where(and(eq(adminRoles.userId, userId), eq(adminRoles.role, 'admin')))
      .limit(1);
    return row !== undefined;
  }
}

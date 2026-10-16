import { adminAuditLog, newId, type Executor } from '@clone/db';

import type { AdminAuditLog } from '../../application/admin-audit-log.ts';
import type { AdminAuditEntry } from '../../domain/admin.ts';

/** Insertion seule : un trigger refuse toute modification ou suppression (migration `0010_admin`). */
export class DrizzleAdminAuditLog implements AdminAuditLog {
  constructor(private readonly db: Executor) {}

  async record({ adminId, action, target, metadata }: AdminAuditEntry): Promise<void> {
    await this.db.insert(adminAuditLog).values({
      id: newId(),
      adminId,
      action,
      targetType: target.type,
      targetId: target.id,
      metadata,
    });
  }
}

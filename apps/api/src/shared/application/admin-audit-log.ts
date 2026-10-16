import type { AdminAuditEntry } from '../domain/admin.ts';

/**
 * Journal d'audit des actions d'administration (table `admin_audit_log`, ADR-011), écrit dans la
 * transaction de l'action (`UnitOfWork`) : une action sans trace n'est jamais validée.
 */
export interface AdminAuditLog {
  record(entry: AdminAuditEntry): Promise<void>;
}

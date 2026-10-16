import type { AdminAuditLog } from '../../../../shared/application/admin-audit-log.ts';
import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { JobQueue } from '../../../../shared/application/job-queue.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import { normalizeAdminReason } from '../../domain/account-moderation.ts';
import { CannotModerateSelfError, UserNotFoundError } from '../../domain/errors.ts';
import type { AuthAccounts } from '../ports/auth-accounts.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

export interface AdminDeletionScope {
  profiles: ProfileRepository;
  audit: AdminAuditLog;
}

/**
 * Supprimer un compte depuis le backoffice (T14) : même suppression que `DeleteMe` (T13). Supabase
 * Auth d'abord (s'il échoue, rien n'a changé) ; puis profil `deleted` et journal d'audit dans une
 * transaction ; puis job `purge-account`.
 */
export class DeleteUserAsAdmin {
  constructor(
    private readonly roles: AdminRoles,
    private readonly profiles: ProfileRepository,
    private readonly authAccounts: AuthAccounts,
    private readonly transaction: UnitOfWork<AdminDeletionScope>,
    private readonly jobs: JobQueue,
  ) {}

  async execute(input: { adminId: string; userId: string; reason: string }): Promise<void> {
    await requireAdmin(this.roles, input.adminId);
    if (input.adminId === input.userId) throw new CannotModerateSelfError();
    const profile = await this.profiles.findById(input.userId);
    if (!profile || profile.status === 'deleted') throw new UserNotFoundError();

    await this.authAccounts.deleteUser(profile.id);
    await this.transaction.run(async ({ profiles, audit }) => {
      await profiles.markDeleted(profile.id);
      await audit.record({
        adminId: input.adminId,
        action: 'user_deleted',
        target: { type: 'user', id: profile.id },
        metadata: {
          reason: normalizeAdminReason(input.reason),
          fromStatus: profile.status,
          toStatus: 'deleted',
        },
      });
    });
    await this.jobs.enqueueAccountPurge(profile.id);
  }
}

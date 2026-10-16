import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import { UserNotFoundError } from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';
import type { UserReportList, UserReportsReader } from '../ports/user-reports-reader.ts';

export const ADMIN_REPORTS_LIMIT = 20;

export interface AdminUserFile {
  profile: Profile;
  reportsReceived: UserReportList;
  reportsFiled: UserReportList;
}

/**
 * Fiche d'un compte dans le backoffice (T14) : profil, statut, compteurs, et les 20 signalements
 * reçus et émis les plus récents. Compte inexistant ou supprimé → `404 user_not_found`. Le plan Clone
 * Plus est ajouté par la route (`GetPlan`, module `billing`), comme pour `Me`.
 */
export class GetUserForAdmin {
  constructor(
    private readonly roles: AdminRoles,
    private readonly profiles: ProfileRepository,
    private readonly reports: UserReportsReader,
  ) {}

  async execute(input: { adminId: string; userId: string }): Promise<AdminUserFile> {
    await requireAdmin(this.roles, input.adminId);
    const profile = await this.profiles.findById(input.userId);
    if (!profile || profile.status === 'deleted') throw new UserNotFoundError();
    const [reportsReceived, reportsFiled] = await Promise.all([
      this.reports.received(profile.id, ADMIN_REPORTS_LIMIT),
      this.reports.filed(profile.id, ADMIN_REPORTS_LIMIT),
    ]);
    return { profile, reportsReceived, reportsFiled };
  }
}

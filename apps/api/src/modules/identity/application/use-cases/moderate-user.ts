import type { AdminAuditLog } from '../../../../shared/application/admin-audit-log.ts';
import { type AdminRoles, requireAdmin } from '../../../../shared/application/admin-roles.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import {
  canTransition,
  type ModerationAction,
  normalizeAdminReason,
  STATUS_TRANSITIONS,
} from '../../domain/account-moderation.ts';
import {
  CannotModerateSelfError,
  InvalidStatusTransitionError,
  UserNotFoundError,
} from '../../domain/errors.ts';
import type { Profile } from '../../domain/profile.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';

export interface ModerationScope {
  profiles: ProfileRepository;
  audit: AdminAuditLog;
}

/**
 * Suspendre, bannir ou réactiver un compte depuis le backoffice (T14). Statut et journal d'audit dans
 * la même transaction (ADR-011). Ensuite, la vérification d'authentification refuse ou rétablit
 * l'accès du compte (ADR-005), et la politique de visibilité le masque ou l'affiche (ADR-006).
 */
export class ModerateUser {
  constructor(
    private readonly roles: AdminRoles,
    private readonly transaction: UnitOfWork<ModerationScope>,
  ) {}

  async execute(input: {
    adminId: string;
    userId: string;
    action: ModerationAction;
    reason: string;
  }): Promise<Profile> {
    await requireAdmin(this.roles, input.adminId);
    if (input.adminId === input.userId) throw new CannotModerateSelfError();
    const transition = STATUS_TRANSITIONS[input.action];

    return this.transaction.run(async ({ profiles, audit }) => {
      const profile = await profiles.findById(input.userId);
      if (!profile || profile.status === 'deleted') throw new UserNotFoundError();
      if (!canTransition(input.action, profile.status)) throw new InvalidStatusTransitionError();
      // Écriture conditionnelle : un changement concurrent depuis la lecture est refusé.
      const changed = await profiles.transitionStatus(profile.id, transition.from, transition.to);
      if (!changed) throw new InvalidStatusTransitionError();
      await audit.record({
        adminId: input.adminId,
        action: transition.audit,
        target: { type: 'user', id: profile.id },
        metadata: {
          reason: normalizeAdminReason(input.reason),
          fromStatus: profile.status,
          toStatus: transition.to,
        },
      });
      return { ...profile, status: transition.to };
    });
  }
}

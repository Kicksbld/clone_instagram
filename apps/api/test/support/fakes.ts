import type {
  AnalyticsEvent,
  AnalyticsTracker,
} from '../../src/shared/application/analytics-tracker.ts';
import type { AdminAuditLog } from '../../src/shared/application/admin-audit-log.ts';
import type { AdminRoles } from '../../src/shared/application/admin-roles.ts';
import type { JobQueue } from '../../src/shared/application/job-queue.ts';
import type { AdminAuditEntry } from '../../src/shared/domain/admin.ts';
import type { UnitOfWork } from '../../src/shared/application/unit-of-work.ts';
import {
  type AuthAccounts,
  AuthAccountsUnavailableError,
} from '../../src/modules/identity/application/ports/auth-accounts.ts';
import type {
  UserReportList,
  UserReportsReader,
} from '../../src/modules/identity/application/ports/user-reports-reader.ts';
import type { MediaStorage } from '../../src/modules/media/application/ports/media-storage.ts';

/** File de jobs en mémoire : enregistre les identifiants enfilés, sans doublon comme le `jobId` BullMQ. */
export class InMemoryJobQueue implements JobQueue {
  readonly imageProcessing = new Set<string>();
  readonly accountPurges = new Set<string>();

  enqueueImageProcessing(mediaId: string): Promise<void> {
    this.imageProcessing.add(mediaId);
    return Promise.resolve();
  }

  enqueueAccountPurge(profileId: string): Promise<void> {
    this.accountPurges.add(profileId);
    return Promise.resolve();
  }
}

/** Supabase Auth en mémoire : utilisateurs supprimés ; `unavailable` simule une panne. */
export class InMemoryAuthAccounts implements AuthAccounts {
  readonly deleted = new Set<string>();
  unavailable = false;

  deleteUser(userId: string): Promise<void> {
    if (this.unavailable) return Promise.reject(new AuthAccountsUnavailableError());
    this.deleted.add(userId);
    return Promise.resolve();
  }
}

/** Storage factice : URL d'upload déterministe, valable 2 h. */
export class FakeMediaStorage implements MediaStorage {
  constructor(private readonly now: () => Date) {}

  createUploadUrl(path: string): Promise<{ url: string; expiresAt: Date }> {
    return Promise.resolve({
      url: `https://storage.test/upload/uploads/${path}?token=test`,
      expiresAt: new Date(this.now().getTime() + 2 * 60 * 60 * 1000),
    });
  }
}

/** `UnitOfWork` en mémoire : exécute sur les repositories en mémoire, sans annulation. */
export class InMemoryUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(private readonly scope: Scope) {}

  run<T>(work: (scope: Scope) => Promise<T>): Promise<T> {
    return work(this.scope);
  }
}

export const sequentialIds = (prefix = '0199a1b2-0000-7000-9000-') => {
  let next = 0;
  return { next: () => `${prefix}${String(++next).padStart(12, '0')}` };
};

/** Analytics en mémoire (ADR-013) : enregistre les événements, aucun appel à PostHog. */
export class InMemoryAnalyticsTracker implements AnalyticsTracker {
  readonly events: { distinctId: string; event: AnalyticsEvent }[] = [];

  track(distinctId: string, event: AnalyticsEvent): void {
    this.events.push({ distinctId, event });
  }
}

/** Rôles d'administration en mémoire (table `admin_roles`). */
export class InMemoryAdminRoles implements AdminRoles {
  readonly admins = new Set<string>();

  isAdmin(userId: string): Promise<boolean> {
    return Promise.resolve(this.admins.has(userId));
  }
}

/** Journal d'audit en mémoire : entrées dans l'ordre d'écriture. */
export class InMemoryAdminAuditLog implements AdminAuditLog {
  readonly entries: AdminAuditEntry[] = [];

  record(entry: AdminAuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** Signalements d'un compte en mémoire, par compte. */
export class InMemoryUserReports implements UserReportsReader {
  readonly receivedBy = new Map<string, UserReportList>();
  readonly filedBy = new Map<string, UserReportList>();

  received(userId: string, limit: number): Promise<UserReportList> {
    return Promise.resolve(this.slice(this.receivedBy.get(userId), limit));
  }

  filed(userId: string, limit: number): Promise<UserReportList> {
    return Promise.resolve(this.slice(this.filedBy.get(userId), limit));
  }

  private slice(list: UserReportList | undefined, limit: number): UserReportList {
    return list
      ? { total: list.total, items: list.items.slice(0, limit) }
      : { total: 0, items: [] };
  }
}

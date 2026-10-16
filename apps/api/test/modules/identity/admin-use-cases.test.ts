import { beforeEach, describe, expect, it } from 'vitest';

import { AuthAccountsUnavailableError } from '../../../src/modules/identity/application/ports/auth-accounts.ts';
import { DeleteUserAsAdmin } from '../../../src/modules/identity/application/use-cases/delete-user-as-admin.ts';
import { GetAdminSession } from '../../../src/modules/identity/application/use-cases/get-admin-session.ts';
import { GetUserForAdmin } from '../../../src/modules/identity/application/use-cases/get-user-for-admin.ts';
import { ListUsersForAdmin } from '../../../src/modules/identity/application/use-cases/list-users-for-admin.ts';
import { ModerateUser } from '../../../src/modules/identity/application/use-cases/moderate-user.ts';
import {
  CannotModerateSelfError,
  InvalidStatusTransitionError,
  UserNotFoundError,
} from '../../../src/modules/identity/domain/errors.ts';
import { AdminRequiredError } from '../../../src/shared/domain/admin.ts';
import {
  InMemoryAdminAuditLog,
  InMemoryAdminRoles,
  InMemoryAuthAccounts,
  InMemoryJobQueue,
  InMemoryUnitOfWork,
  InMemoryUserReports,
} from '../../support/fakes.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';

const ADMIN = '0199a1b2-0000-7000-8000-00000000a001';
const USER = '0199a1b2-0000-7000-8000-000000000001';
const STRANGER = '0199a1b2-0000-7000-8000-000000000002';

let profiles: InMemoryProfileRepository;
let roles: InMemoryAdminRoles;
let audit: InMemoryAdminAuditLog;
let transaction: InMemoryUnitOfWork<{
  profiles: InMemoryProfileRepository;
  audit: InMemoryAdminAuditLog;
}>;

beforeEach(() => {
  profiles = new InMemoryProfileRepository();
  roles = new InMemoryAdminRoles();
  roles.admins.add(ADMIN);
  audit = new InMemoryAdminAuditLog();
  transaction = new InMemoryUnitOfWork({ profiles, audit });
  profiles.add({ id: USER, username: 'ines' });
});

describe('rôle admin vérifié par chaque use case', () => {
  it.each([
    ['GetAdminSession', () => new GetAdminSession(roles).execute({ userId: STRANGER })],
    [
      'ListUsersForAdmin',
      () => new ListUsersForAdmin(roles, profiles).execute({ adminId: STRANGER, after: null }),
    ],
    [
      'GetUserForAdmin',
      () =>
        new GetUserForAdmin(roles, profiles, new InMemoryUserReports()).execute({
          adminId: STRANGER,
          userId: USER,
        }),
    ],
    [
      'ModerateUser',
      () =>
        new ModerateUser(roles, transaction).execute({
          adminId: STRANGER,
          userId: USER,
          action: 'suspend',
          reason: 'Spam',
        }),
    ],
    [
      'DeleteUserAsAdmin',
      () =>
        new DeleteUserAsAdmin(
          roles,
          profiles,
          new InMemoryAuthAccounts(),
          transaction,
          new InMemoryJobQueue(),
        ).execute({ adminId: STRANGER, userId: USER, reason: 'Spam' }),
    ],
  ])('%s : non-admin → admin_required, rien ne change', async (_name, run) => {
    await expect(run()).rejects.toBeInstanceOf(AdminRequiredError);
    expect(profiles.rows.get(USER)?.status).toBe('active');
    expect(audit.entries).toEqual([]);
  });

  it('GetAdminSession : admin → session', async () => {
    await expect(new GetAdminSession(roles).execute({ userId: ADMIN })).resolves.toEqual({
      id: ADMIN,
      role: 'admin',
    });
  });
});

describe('ModerateUser', () => {
  const moderate = (action: 'suspend' | 'ban' | 'reactivate', userId = USER) =>
    new ModerateUser(roles, transaction).execute({
      adminId: ADMIN,
      userId,
      action,
      reason: '  Spam répété ',
    });

  it('suspend : statut changé et action écrite dans le journal, avec le motif nettoyé', async () => {
    const profile = await moderate('suspend');

    expect(profile.status).toBe('suspended');
    expect(profiles.rows.get(USER)?.status).toBe('suspended');
    expect(audit.entries).toEqual([
      {
        adminId: ADMIN,
        action: 'user_suspended',
        target: { type: 'user', id: USER },
        metadata: { reason: 'Spam répété', fromStatus: 'active', toStatus: 'suspended' },
      },
    ]);
  });

  it('suspendre, bannir, puis réactiver', async () => {
    await moderate('suspend');
    await moderate('ban');
    const profile = await moderate('reactivate');

    expect(profile.status).toBe('active');
    expect(audit.entries.map((entry) => entry.action)).toEqual([
      'user_suspended',
      'user_banned',
      'user_reactivated',
    ]);
  });

  it.each([
    ['suspend', 'banned'],
    ['suspend', 'suspended'],
    ['ban', 'banned'],
    ['reactivate', 'active'],
  ] as const)('%s depuis %s → invalid_status_transition, sans audit', async (action, status) => {
    profiles.add({ id: USER, username: 'ines', status });

    await expect(moderate(action)).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(profiles.rows.get(USER)?.status).toBe(status);
    expect(audit.entries).toEqual([]);
  });

  it('compte inexistant ou supprimé → user_not_found', async () => {
    await expect(moderate('suspend', STRANGER)).rejects.toBeInstanceOf(UserNotFoundError);
    profiles.add({ id: USER, username: 'ines', status: 'deleted' });
    await expect(moderate('reactivate')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('soi-même → cannot_moderate_self', async () => {
    profiles.add({ id: ADMIN, username: 'admin' });

    await expect(moderate('suspend', ADMIN)).rejects.toBeInstanceOf(CannotModerateSelfError);
    expect(profiles.rows.get(ADMIN)?.status).toBe('active');
  });
});

describe('DeleteUserAsAdmin', () => {
  let authAccounts: InMemoryAuthAccounts;
  let jobs: InMemoryJobQueue;
  const deleteUser = (userId = USER) =>
    new DeleteUserAsAdmin(roles, profiles, authAccounts, transaction, jobs).execute({
      adminId: ADMIN,
      userId,
      reason: 'Usurpation',
    });

  beforeEach(() => {
    authAccounts = new InMemoryAuthAccounts();
    jobs = new InMemoryJobQueue();
  });

  it('utilisateur Auth supprimé, profil deleted, audit, puis purge enfilée', async () => {
    profiles.add({ id: USER, username: 'ines', status: 'banned' });

    await deleteUser();

    expect(authAccounts.deleted).toEqual(new Set([USER]));
    expect(profiles.rows.get(USER)?.status).toBe('deleted');
    expect(audit.entries).toEqual([
      {
        adminId: ADMIN,
        action: 'user_deleted',
        target: { type: 'user', id: USER },
        metadata: { reason: 'Usurpation', fromStatus: 'banned', toStatus: 'deleted' },
      },
    ]);
    expect(jobs.accountPurges).toEqual(new Set([USER]));
  });

  it('Supabase Auth injoignable → erreur, compte intact', async () => {
    authAccounts.unavailable = true;

    await expect(deleteUser()).rejects.toBeInstanceOf(AuthAccountsUnavailableError);
    expect(profiles.rows.get(USER)?.status).toBe('active');
    expect(audit.entries).toEqual([]);
    expect(jobs.accountPurges.size).toBe(0);
  });

  it('compte inexistant ou déjà supprimé → user_not_found', async () => {
    await expect(deleteUser(STRANGER)).rejects.toBeInstanceOf(UserNotFoundError);
    profiles.add({ id: USER, username: 'ines', status: 'deleted' });
    await expect(deleteUser()).rejects.toBeInstanceOf(UserNotFoundError);
    expect(authAccounts.deleted.size).toBe(0);
  });

  it('soi-même → cannot_moderate_self', async () => {
    await expect(deleteUser(ADMIN)).rejects.toBeInstanceOf(CannotModerateSelfError);
  });
});

describe('ListUsersForAdmin', () => {
  const list = (input: { query?: string; status?: 'active' | 'suspended' | 'banned' } = {}) =>
    new ListUsersForAdmin(roles, profiles).execute({ adminId: ADMIN, after: null, ...input });

  it('tous les comptes non supprimés, filtrés par texte et statut', async () => {
    profiles.add({ id: STRANGER, username: 'killian', fullName: 'Killian B', status: 'banned' });
    profiles.add({
      id: '0199a1b2-0000-7000-8000-000000000003',
      username: 'gone',
      status: 'deleted',
    });

    expect((await list()).items.map((p) => p.username).sort()).toEqual(['ines', 'killian']);
    expect((await list({ query: '@KILL' })).items.map((p) => p.id)).toEqual([STRANGER]);
    expect((await list({ status: 'active' })).items.map((p) => p.id)).toEqual([USER]);
    expect((await list({ query: 'x'.repeat(31) })).items).toEqual([]);
  });
});

describe('GetUserForAdmin', () => {
  it('fiche avec signalements reçus et émis ; compte supprimé → user_not_found', async () => {
    const reports = new InMemoryUserReports();
    reports.receivedBy.set(USER, { total: 1, items: [] });
    const getUser = new GetUserForAdmin(roles, profiles, reports);

    await expect(getUser.execute({ adminId: ADMIN, userId: USER })).resolves.toMatchObject({
      profile: { id: USER },
      reportsReceived: { total: 1 },
      reportsFiled: { total: 0 },
    });
    profiles.add({ id: USER, username: 'ines', status: 'deleted' });
    await expect(getUser.execute({ adminId: ADMIN, userId: USER })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});

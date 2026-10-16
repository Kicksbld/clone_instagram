import 'server-only';

import type { components } from '@clone/contract';

import type { ApiClient } from '@/lib/api/client';

import type { UserSearch } from '../schemas/search';

export type AdminUserSummary = components['schemas']['AdminUserSummary'];
export type AdminUserDetail = components['schemas']['AdminUserDetail'];
export type AdminReport = components['schemas']['AdminReport'];
export type AdminUserPage = components['schemas']['AdminUserPage'];

/** Une page de comptes ; `invalid_cursor` si le curseur de l'URL est périmé ou modifié. */
export type UserListResult = { kind: 'page'; page: AdminUserPage } | { kind: 'invalid_cursor' };

export async function listUsers(client: ApiClient, search: UserSearch): Promise<UserListResult> {
  const { data, error, response } = await client.GET('/v1/admin/users', {
    params: { query: search },
    cache: 'no-store',
  });
  if (data) return { kind: 'page', page: data };
  if (response.status === 400 && error?.code === 'invalid_cursor')
    return { kind: 'invalid_cursor' };
  throw new Error(`API : GET /v1/admin/users → HTTP ${response.status}`);
}

/** Fiche d'un compte ; `null` s'il n'existe pas ou a été supprimé. */
export async function getUser(client: ApiClient, id: string): Promise<AdminUserDetail | null> {
  const { data, response } = await client.GET('/v1/admin/users/{id}', {
    params: { path: { id } },
    cache: 'no-store',
  });
  if (data) return data;
  // 400 : identifiant qui n'est pas un UUID, introuvable lui aussi.
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`API : GET /v1/admin/users/${id} → HTTP ${response.status}`);
}

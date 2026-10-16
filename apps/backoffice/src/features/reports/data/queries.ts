import 'server-only';

import type { components } from '@clone/contract';

import type { ApiClient } from '@/lib/api/client';

import type { ReportSearch } from '../schemas/search';

export type AdminReportSummary = components['schemas']['AdminReportSummary'];
export type AdminReportPage = components['schemas']['AdminReportPage'];
export type AdminReportDetail = components['schemas']['AdminReportDetail'];

/** Une page de la file ; `invalid_cursor` si le curseur de l'URL est périmé ou modifié. */
export type ReportListResult = { kind: 'page'; page: AdminReportPage } | { kind: 'invalid_cursor' };

export async function listReports(
  client: ApiClient,
  search: ReportSearch,
): Promise<ReportListResult> {
  const { data, error, response } = await client.GET('/v1/admin/reports', {
    params: { query: search },
    cache: 'no-store',
  });
  if (data) return { kind: 'page', page: data };
  if (response.status === 400 && error?.code === 'invalid_cursor')
    return { kind: 'invalid_cursor' };
  throw new Error(`API : GET /v1/admin/reports → HTTP ${response.status}`);
}

/** Détail d'un signalement ; `null` s'il n'existe pas. */
export async function getReport(client: ApiClient, id: string): Promise<AdminReportDetail | null> {
  const { data, response } = await client.GET('/v1/admin/reports/{id}', {
    params: { path: { id } },
    cache: 'no-store',
  });
  if (data) return data;
  // 400 : identifiant qui n'est pas un UUID, introuvable lui aussi.
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`API : GET /v1/admin/reports/${id} → HTTP ${response.status}`);
}

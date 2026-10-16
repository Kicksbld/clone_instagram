import 'server-only';

import type { ApiClient } from '@/lib/api/client';

/** Résultat de `GET /v1/admin/me` : la session est-elle celle d'un admin ? */
export type AdminCheck = 'admin' | 'unauthenticated' | 'not_admin';

/** L'API est l'autorité pour le rôle `admin` (ADR-011). Autre réponse ou API injoignable → erreur. */
export async function checkAdmin(client: ApiClient): Promise<AdminCheck> {
  const { response } = await client.GET('/v1/admin/me', { cache: 'no-store' });
  if (response.ok) return 'admin';
  if (response.status === 401) return 'unauthenticated';
  if (response.status === 403) return 'not_admin';
  throw new Error(`API : GET /v1/admin/me → HTTP ${response.status}`);
}

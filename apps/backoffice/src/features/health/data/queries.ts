import 'server-only';

import { createApiClient, type ApiClient } from '@/lib/api/client';

export type ApiHealth = 'ok' | 'unreachable';

/** État de l'API, lu à chaque requête (pas de cache). */
export async function getApiHealth(client: ApiClient = createApiClient()): Promise<ApiHealth> {
  try {
    const { data } = await client.GET('/health', { cache: 'no-store' });
    return data?.status === 'ok' ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

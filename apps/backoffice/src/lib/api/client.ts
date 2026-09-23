import 'server-only';

import type { paths } from '@clone/contract';
import createClient from 'openapi-fetch';

/**
 * Client de l'API, généré depuis le contrat (ADR-003). Côté serveur uniquement (ADR-011) :
 * seuls les fichiers `features/*\/data/` l'importent, jamais un composant.
 */
export type ApiClient = ReturnType<typeof createClient<paths>>;

export function createApiClient(): ApiClient {
  const baseUrl = process.env['API_URL'];
  if (!baseUrl) throw new Error('API_URL manquante (voir .env.example)');
  return createClient<paths>({ baseUrl });
}

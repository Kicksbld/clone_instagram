import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import { RateLimitedError } from '../../domain/errors.ts';

/**
 * Rate limiting en mémoire (ADR-005), une seule instance d'API. Aucune limite globale : chaque
 * route limitée déclare `config: { rateLimit: { max, timeWindow } }`. Compté par utilisateur
 * authentifié, après la vérification du JWT (`preHandler`). Réponse `429 rate_limited` +
 * `Retry-After` (secondes).
 */
export function registerRateLimit(app: FastifyInstance): void {
  void app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    keyGenerator: (request) => request.userId ?? request.ip,
    addHeadersOnExceeding: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
    },
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
      'retry-after': true,
    },
    errorResponseBuilder: () => new RateLimitedError(),
  });
}

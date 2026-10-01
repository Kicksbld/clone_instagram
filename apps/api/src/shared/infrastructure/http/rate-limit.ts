import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import { RateLimitedError } from '../../domain/errors.ts';

/** Limite par défaut de chaque route, par utilisateur (ADR-005). */
export const DEFAULT_RATE_LIMIT = { max: 120, timeWindow: '1 minute' } as const;

/**
 * Rate limiting en mémoire (ADR-005), une seule instance d'API : 120 requêtes par minute et par
 * utilisateur sur chaque route déclarée après ce plugin (les routes `/v1`, pas `/health`) ; une route
 * plus limitée déclare `config: { rateLimit: { max, timeWindow } }`. Compté par utilisateur
 * authentifié, après la vérification du JWT (`preHandler`). Réponse `429 rate_limited` +
 * `Retry-After` (secondes).
 */
export function registerRateLimit(app: FastifyInstance): void {
  void app.register(rateLimit, {
    global: true,
    ...DEFAULT_RATE_LIMIT,
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

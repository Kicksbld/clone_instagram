import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';

import type { Config } from './shared/infrastructure/config.ts';
import { installContractValidation } from './shared/infrastructure/http/contract-schemas.ts';
import { registerErrorHandling } from './shared/infrastructure/http/error-handler.ts';
import { registerHealthRoutes } from './shared/infrastructure/http/health-routes.ts';

export interface AppOptions {
  logLevel: Config['LOG_LEVEL'];
}

/** Application HTTP, sans écoute réseau : utilisée par `main.ts` et par les tests (`fastify.inject`). */
export function buildApp({ logLevel }: AppOptions) {
  const app = Fastify({
    logger: {
      level: logLevel,
      // Ni jeton ni donnée personnelle dans les logs (ADR-005) : ni en-têtes, ni IP, ni query string.
      serializers: {
        req: (request: { method: string; url: string }) => ({
          method: request.method,
          path: request.url.split('?')[0],
        }),
      },
    },
    genReqId: () => randomUUID(),
    requestIdHeader: false,
  });

  installContractValidation(app);
  registerErrorHandling(app);
  registerHealthRoutes(app);

  return app;
}

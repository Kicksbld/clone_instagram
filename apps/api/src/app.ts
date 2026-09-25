import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';

import {
  type IdentityUseCases,
  registerIdentityRoutes,
} from './modules/identity/infrastructure/http/identity-routes.ts';
import {
  decorateAuthentication,
  requireAuthentication,
} from './shared/infrastructure/auth/authentication.ts';
import type { TokenVerifier } from './shared/infrastructure/auth/token-verifier.ts';
import type { Config } from './shared/infrastructure/config.ts';
import { installContractValidation } from './shared/infrastructure/http/contract-schemas.ts';
import { registerErrorHandling } from './shared/infrastructure/http/error-handler.ts';
import { registerHealthRoutes } from './shared/infrastructure/http/health-routes.ts';

/** Dépendances assemblées par `main.ts` (ou par les tests, avec des adapters en mémoire). */
export interface AppDependencies {
  tokenVerifier: TokenVerifier;
  identity: IdentityUseCases;
}

export interface AppOptions {
  logLevel: Config['LOG_LEVEL'];
  dependencies: AppDependencies;
}

/** Application HTTP, sans écoute réseau : utilisée par `main.ts` et par les tests (`fastify.inject`). */
export function buildApp({ logLevel, dependencies }: AppOptions) {
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
  decorateAuthentication(app);
  registerHealthRoutes(app);

  // Routes `/v1` : toutes authentifiées (ADR-003).
  void app.register((v1, _options, done) => {
    requireAuthentication(v1, dependencies.tokenVerifier);
    registerIdentityRoutes(v1, dependencies.identity);
    done();
  });

  return app;
}

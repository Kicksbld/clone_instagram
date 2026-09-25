import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';

import {
  type IdentityUseCases,
  registerIdentityRoutes,
} from './modules/identity/infrastructure/http/identity-routes.ts';
import {
  type MediaUseCases,
  registerMediaRoutes,
} from './modules/media/infrastructure/http/media-routes.ts';
import {
  type PostsUseCases,
  registerPostsRoutes,
} from './modules/posts/infrastructure/http/posts-routes.ts';
import {
  registerSocialRoutes,
  type SocialUseCases,
} from './modules/social/infrastructure/http/social-routes.ts';
import {
  decorateAuthentication,
  requireAuthentication,
} from './shared/infrastructure/auth/authentication.ts';
import type { TokenVerifier } from './shared/infrastructure/auth/token-verifier.ts';
import type { Config } from './shared/infrastructure/config.ts';
import { installContractValidation } from './shared/infrastructure/http/contract-schemas.ts';
import { registerErrorHandling } from './shared/infrastructure/http/error-handler.ts';
import { registerHealthRoutes } from './shared/infrastructure/http/health-routes.ts';
import type { PublicMediaUrls } from './shared/infrastructure/http/public-media-urls.ts';
import { registerRateLimit } from './shared/infrastructure/http/rate-limit.ts';

/** Dépendances assemblées par `main.ts` (ou par les tests, avec des adapters en mémoire). */
export interface AppDependencies {
  tokenVerifier: TokenVerifier;
  identity: IdentityUseCases;
  media: MediaUseCases;
  social: SocialUseCases;
  posts: PostsUseCases;
  mediaUrls: PublicMediaUrls;
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
  // Avant les routes : le plugin lit leur `config.rateLimit` à leur déclaration.
  registerRateLimit(app);

  // Routes `/v1` : toutes authentifiées (ADR-003).
  void app.register((v1, _options, done) => {
    requireAuthentication(v1, dependencies.tokenVerifier);
    registerIdentityRoutes(v1, dependencies.identity, dependencies.mediaUrls);
    registerMediaRoutes(v1, dependencies.media, dependencies.mediaUrls);
    registerSocialRoutes(v1, dependencies.social, dependencies.mediaUrls);
    registerPostsRoutes(v1, dependencies.posts, dependencies.mediaUrls);
    done();
  });

  return app;
}

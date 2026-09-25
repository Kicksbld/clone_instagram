import type { FastifyInstance, FastifyRequest } from 'fastify';

import { UnauthenticatedError, type TokenVerifier } from './token-verifier.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Utilisateur authentifié, renseigné par `requireAuthentication`. */
    userId: string | null;
  }
}

const BEARER = /^Bearer (\S+)$/i;

export function decorateAuthentication(app: FastifyInstance): void {
  app.decorateRequest('userId', null);
}

/** Le contrôleur authentifie (ADR-005) : toutes les routes du scope exigent un JWT Supabase valide. */
export function requireAuthentication(scope: FastifyInstance, verifier: TokenVerifier): void {
  scope.addHook('onRequest', async (request) => {
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthenticatedError('En-tête « Authorization: Bearer <JWT> » requis.');
    request.userId = (await verifier.verify(token)).userId;
  });
}

export function authenticatedUserId(request: FastifyRequest): string {
  if (!request.userId) throw new UnauthenticatedError('Requête non authentifiée.');
  return request.userId;
}

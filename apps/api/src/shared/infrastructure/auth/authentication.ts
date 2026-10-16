import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AccountStatusReader } from '../../application/account-status-reader.ts';
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

/**
 * Le contrôleur authentifie (ADR-005) : toutes les routes du scope exigent un JWT Supabase valide,
 * d'un compte qui n'est pas supprimé (un JWT reste valide jusqu'à son expiration, T13). Sans profil
 * (onboarding non terminé), la requête passe : chaque use case renvoie `profile_not_found`.
 */
export function requireAuthentication(
  scope: FastifyInstance,
  verifier: TokenVerifier,
  accounts: AccountStatusReader,
): void {
  scope.addHook('onRequest', async (request) => {
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthenticatedError('En-tête « Authorization: Bearer <JWT> » requis.');
    const { userId } = await verifier.verify(token);
    if ((await accounts.statusOf(userId)) === 'deleted') {
      throw new UnauthenticatedError('Ce compte a été supprimé.');
    }
    request.userId = userId;
  });
}

export function authenticatedUserId(request: FastifyRequest): string {
  if (!request.userId) throw new UnauthenticatedError('Requête non authentifiée.');
  return request.userId;
}

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AccountStatusReader } from '../../application/account-status-reader.ts';
import { ForbiddenError } from '../../domain/errors.ts';
import { UnauthenticatedError, type TokenVerifier } from './token-verifier.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Utilisateur authentifié, renseigné par `requireAuthentication`. */
    userId: string | null;
  }
  interface FastifyContextConfig {
    /**
     * Route ouverte à un compte suspendu ou banni (ADR-005) : `GET /v1/me` (l'app affiche l'écran
     * « Compte suspendu ») et `DELETE /v1/me` (suppression du compte toujours possible).
     */
    allowSuspendedAccount?: boolean;
  }
}

/** Compte suspendu ou banni : toute route refusée, sauf celles qui l'autorisent (ADR-005). */
export class AccountSuspendedError extends ForbiddenError {
  constructor() {
    super('account_suspended', 'Ce compte est suspendu.');
  }
}

const BEARER = /^Bearer (\S+)$/i;

export function decorateAuthentication(app: FastifyInstance): void {
  app.decorateRequest('userId', null);
}

/**
 * Le contrôleur authentifie (ADR-005) : toutes les routes du scope exigent un JWT Supabase valide,
 * d'un compte qui n'est pas supprimé (un JWT reste valide jusqu'à son expiration, T13), ni suspendu
 * ou banni (`403 account_suspended`, sauf routes `allowSuspendedAccount`, T14). Sans profil
 * (onboarding non terminé, ou admin du backoffice), la requête passe : chaque use case renvoie
 * `profile_not_found`, ou vérifie le rôle admin.
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
    const status = await accounts.statusOf(userId);
    if (status === 'deleted') throw new UnauthenticatedError('Ce compte a été supprimé.');
    if (
      (status === 'suspended' || status === 'banned') &&
      request.routeOptions.config.allowSuspendedAccount !== true
    ) {
      throw new AccountSuspendedError();
    }
    request.userId = userId;
  });
}

export function authenticatedUserId(request: FastifyRequest): string {
  if (!request.userId) throw new UnauthenticatedError('Requête non authentifiée.');
  return request.userId;
}

import { STATUS_CODES } from 'node:http';

import type { ProblemDetails } from '@clone/contract';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { DomainError } from '../../domain/errors.ts';
import { UnauthenticatedError } from '../auth/token-verifier.ts';

/** Gestionnaire d'erreurs unique : toute erreur devient un Problem Details (ADR-003, ADR-005). */

const STATUS_BY_KIND = {
  bad_request: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  business_rule: 422,
  too_many_requests: 429,
} as const satisfies Record<DomainError['kind'], number>;

export function problem(status: number, code: string, detail: string): ProblemDetails {
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, detail, code };
}

function sendProblem(reply: FastifyReply, body: ProblemDetails): FastifyReply {
  return reply.status(body.status).type('application/problem+json').send(JSON.stringify(body));
}

/** Erreur 4xx levée par Fastify lui-même : validation, JSON illisible, type de contenu refusé… */
function isClientError(error: unknown): error is Error & { statusCode: number } {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  const { statusCode } = error;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof UnauthenticatedError) {
      return sendProblem(reply, problem(401, error.code, error.message));
    }
    if (error instanceof DomainError) {
      return sendProblem(reply, problem(STATUS_BY_KIND[error.kind], error.code, error.message));
    }
    if (isClientError(error)) {
      return sendProblem(reply, problem(error.statusCode, 'validation_failed', error.message));
    }
    request.log.error({ err: error }, 'Erreur inattendue');
    return sendProblem(
      reply,
      problem(500, 'internal_error', 'Une erreur inattendue est survenue.'),
    );
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    return sendProblem(
      reply,
      problem(404, 'route_not_found', `Aucune route ${request.method} ${path}`),
    );
  });
}

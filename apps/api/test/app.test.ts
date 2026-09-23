import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.ts';
import { BusinessRuleError, ConflictError, NotFoundError } from '../src/shared/domain/errors.ts';

let app: ReturnType<typeof buildApp>;

function createApp() {
  app = buildApp({ logLevel: 'silent' });
  return app;
}

afterEach(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('répond 200 { status: "ok" } sans authentification', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('n’est pas servie sous /v1', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(404);
  });
});

describe('gestion des erreurs (Problem Details)', () => {
  it('route inconnue → 404 route_not_found', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/nope?token=secret' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Aucune route GET /nope',
      code: 'route_not_found',
    });
  });

  it.each([
    [new NotFoundError('profile_not_found', 'Profil introuvable'), 404],
    [new ConflictError('username_taken', 'Username déjà pris'), 409],
    [new BusinessRuleError('reply_depth_exceeded', 'Réponse à une réponse'), 422],
  ])('erreur métier %s → statut %i avec son code', async (error, status) => {
    const server = createApp();
    server.get('/test/domain-error', () => {
      throw error;
    });

    const response = await server.inject({ method: 'GET', url: '/test/domain-error' });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ status, code: error.code, detail: error.message });
  });

  it('erreur inattendue → 500 internal_error sans détail interne', async () => {
    const server = createApp();
    server.get('/test/crash', () => {
      throw new Error('connexion refusée à postgres://user:motdepasse@db');
    });

    const response = await server.inject({ method: 'GET', url: '/test/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Une erreur inattendue est survenue.',
      code: 'internal_error',
    });
    expect(response.body).not.toContain('motdepasse');
  });
});

describe('validation des entrées', () => {
  function appWithBodyRoute() {
    const server = createApp();
    server.post(
      '/test/validation',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['username'],
            properties: { username: { type: 'string', minLength: 1 } },
          },
        },
      },
      () => ({ ok: true }),
    );
    return server;
  }

  it('accepte une entrée conforme', async () => {
    const response = await appWithBodyRoute().inject({
      method: 'POST',
      url: '/test/validation',
      payload: { username: 'killian' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('entrée non conforme → 400 validation_failed', async () => {
    const response = await appWithBodyRoute().inject({
      method: 'POST',
      url: '/test/validation',
      payload: { username: 42 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 400, code: 'validation_failed' });
  });

  it('champ inconnu → 400 validation_failed', async () => {
    const response = await appWithBodyRoute().inject({
      method: 'POST',
      url: '/test/validation',
      payload: { username: 'killian', isAdmin: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });

  it('JSON illisible → 400 validation_failed', async () => {
    const response = await appWithBodyRoute().inject({
      method: 'POST',
      url: '/test/validation',
      headers: { 'content-type': 'application/json' },
      payload: '{ pas du json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });
});

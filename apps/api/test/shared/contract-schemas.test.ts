import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  installContractValidation,
  routeSchemaFor,
} from '../../src/shared/infrastructure/http/contract-schemas.ts';

describe('schémas de réponse du contrat (ADR-019)', () => {
  it('un champ absent du contrat n’est jamais envoyé, même sans additionalProperties: false', async () => {
    const app = Fastify();
    installContractValidation(app);
    app.get('/health', { schema: routeSchemaFor('getHealth') }, () => ({
      status: 'ok',
      interne: 'ne doit pas sortir',
    }));

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

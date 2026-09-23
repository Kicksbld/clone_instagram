import type { paths } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { routeSchemaFor } from './contract-schemas.ts';

type HealthResponse = paths['/health']['get']['responses'][200]['content']['application/json'];

/** `GET /health` : liveness, hors `/v1`, sans authentification ni accès à Postgres ou Redis. */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', { schema: routeSchemaFor('getHealth') }, (): HealthResponse => ({
    status: 'ok',
  }));
}

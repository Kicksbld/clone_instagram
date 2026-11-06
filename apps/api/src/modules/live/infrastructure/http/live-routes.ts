import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { CreateLiveParticipantToken } from '../../application/use-cases/create-live-participant-token.ts';

export interface LiveUseCases {
  createParticipantToken: CreateLiveParticipantToken;
}

/** Routes du module `live` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerLiveRoutes(app: FastifyInstance, useCases: LiveUseCases): void {
  app.post(
    '/v1/live/participant-token',
    { schema: routeSchemaFor('createLiveParticipantToken') },
    async (request): Promise<components['schemas']['LiveParticipantToken']> =>
      useCases.createParticipantToken.execute({ userId: authenticatedUserId(request) }),
  );
}

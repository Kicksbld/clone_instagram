import type { components, operations } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { CheckUsernameAvailability } from '../../application/use-cases/check-username-availability.ts';
import type { CompleteOnboarding } from '../../application/use-cases/complete-onboarding.ts';
import type { GetMe } from '../../application/use-cases/get-me.ts';
import type { UpdateMe } from '../../application/use-cases/update-me.ts';
import type { Profile } from '../../domain/profile.ts';

export interface IdentityUseCases {
  getMe: GetMe;
  updateMe: UpdateMe;
  completeOnboarding: CompleteOnboarding;
  checkUsernameAvailability: CheckUsernameAvailability;
}

type Me = components['schemas']['Me'];
type JsonBody<Operation extends keyof operations> = operations[Operation] extends {
  requestBody: { content: { 'application/json': infer Body } };
}
  ? Body
  : never;

function toMe(profile: Profile): Me {
  return { ...profile, createdAt: profile.createdAt.toISOString() };
}

/** Routes du module `identity` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerIdentityRoutes(app: FastifyInstance, useCases: IdentityUseCases): void {
  app.get('/v1/me', { schema: routeSchemaFor('getMe') }, async (request): Promise<Me> => {
    return toMe(await useCases.getMe.execute({ userId: authenticatedUserId(request) }));
  });

  app.patch<{ Body: JsonBody<'updateMe'> }>(
    '/v1/me',
    { schema: routeSchemaFor('updateMe') },
    async (request): Promise<Me> => {
      const profile = await useCases.updateMe.execute({
        userId: authenticatedUserId(request),
        changes: request.body,
      });
      return toMe(profile);
    },
  );

  app.post<{ Body: JsonBody<'completeOnboarding'> }>(
    '/v1/me/onboarding',
    { schema: routeSchemaFor('completeOnboarding') },
    async (request, reply): Promise<Me> => {
      const profile = await useCases.completeOnboarding.execute({
        userId: authenticatedUserId(request),
        ...request.body,
      });
      reply.status(201);
      return toMe(profile);
    },
  );

  app.get<{ Params: { username: string } }>(
    '/v1/usernames/:username/availability',
    { schema: routeSchemaFor('getUsernameAvailability') },
    async (request): Promise<components['schemas']['UsernameAvailability']> => {
      return useCases.checkUsernameAvailability.execute({
        userId: authenticatedUserId(request),
        username: request.params.username,
      });
    },
  );
}

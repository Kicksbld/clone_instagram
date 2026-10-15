import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { RefreshSubscription } from '../../application/use-cases/refresh-subscription.ts';

export interface BillingUseCases {
  refreshSubscription: RefreshSubscription;
}

/** Routes du module `billing` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerBillingRoutes(app: FastifyInstance, useCases: BillingUseCases): void {
  app.post(
    '/v1/me/subscription/refresh',
    { schema: routeSchemaFor('refreshSubscription') },
    async (request): Promise<components['schemas']['SubscriptionStatus']> => {
      const result = await useCases.refreshSubscription.execute({
        userId: authenticatedUserId(request),
      });
      if (result.providerUnavailable) {
        request.log.warn('RevenueCat injoignable : dernier statut d’abonnement conservé');
      }
      return {
        plan: result.plan,
        ...(result.expiresAt && { expiresAt: result.expiresAt.toISOString() }),
      };
    },
  );
}

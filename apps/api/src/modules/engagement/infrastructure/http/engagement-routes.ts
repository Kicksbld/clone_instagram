import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { LikePost } from '../../application/use-cases/like-post.ts';
import type { UnlikePost } from '../../application/use-cases/unlike-post.ts';

export interface EngagementUseCases {
  likePost: LikePost;
  unlikePost: UnlikePost;
}

type LikeStatus = components['schemas']['LikeStatus'];

/** Routes du module `engagement` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerEngagementRoutes(app: FastifyInstance, useCases: EngagementUseCases): void {
  app.put<{ Params: { id: string } }>(
    '/v1/posts/:id/like',
    { schema: routeSchemaFor('likePost') },
    async (request): Promise<LikeStatus> => {
      return useCases.likePost.execute({
        viewerId: authenticatedUserId(request),
        postId: request.params.id,
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/posts/:id/like',
    { schema: routeSchemaFor('unlikePost') },
    async (request): Promise<LikeStatus> => {
      return useCases.unlikePost.execute({
        viewerId: authenticatedUserId(request),
        postId: request.params.id,
      });
    },
  );
}

import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import { toPostResponse } from '../../../posts/infrastructure/http/post-response.ts';
import type { GetFeed } from '../../application/use-cases/get-feed.ts';

export interface FeedUseCases {
  getFeed: GetFeed;
}

/** Routes du module `feed` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerFeedRoutes(
  app: FastifyInstance,
  useCases: FeedUseCases,
  urls: PublicMediaUrls,
): void {
  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/feed',
    { schema: routeSchemaFor('getFeed') },
    async (request): Promise<components['schemas']['PostPage']> => {
      const page = await useCases.getFeed.execute({
        viewerId: authenticatedUserId(request),
        after: parseCursor(request.query.cursor),
      });
      return {
        items: page.items.map((post) => toPostResponse(post, urls)),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );
}

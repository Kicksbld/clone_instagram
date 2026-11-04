import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import { toPostResponse } from '../../../posts/infrastructure/http/post-response.ts';
import type { GetFeed } from '../../application/use-cases/get-feed.ts';
import type { GetFriendsReels } from '../../application/use-cases/get-friends-reels.ts';
import type { GetReelsFeed } from '../../application/use-cases/get-reels-feed.ts';
import type { ListReelFriendInteractions } from '../../application/use-cases/list-reel-friend-interactions.ts';
import type { FriendInteraction } from '../../domain/feed.ts';

export interface FeedUseCases {
  getFeed: GetFeed;
  getReelsFeed: GetReelsFeed;
  getFriendsReels: GetFriendsReels;
  listReelFriendInteractions: ListReelFriendInteractions;
}

/** Interaction d'un ami (domaine) → schéma `FriendInteraction` du contrat (ADR-029). */
function toFriendInteractionResponse(
  { friend, kinds, commentText }: FriendInteraction,
  urls: PublicMediaUrls,
): components['schemas']['FriendInteraction'] {
  return {
    user: {
      id: friend.id,
      username: friend.username,
      ...(friend.avatarVariants && { avatar: urls.of(friend.avatarVariants) }),
    },
    kinds,
    ...(commentText !== undefined && { commentText }),
  };
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
  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/reels/feed',
    { schema: routeSchemaFor('getReelsFeed') },
    async (request): Promise<components['schemas']['PostPage']> => {
      const page = await useCases.getReelsFeed.execute({
        viewerId: authenticatedUserId(request),
        after: parseCursor(request.query.cursor),
      });
      return {
        items: page.items.map((post) => toPostResponse(post, urls)),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );
  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/reels/friends',
    { schema: routeSchemaFor('getFriendsReels') },
    async (request): Promise<components['schemas']['PostPage']> => {
      const page = await useCases.getFriendsReels.execute({
        viewerId: authenticatedUserId(request),
        after: parseCursor(request.query.cursor),
      });
      return {
        items: page.items.map(({ post, friendInteractions, friendInteractionCount }) => ({
          ...toPostResponse(post, urls),
          ...(friendInteractionCount > 0 && {
            friendInteractions: friendInteractions.map((item) =>
              toFriendInteractionResponse(item, urls),
            ),
            friendInteractionCount,
          }),
        })),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    '/v1/reels/:id/friend-interactions',
    { schema: routeSchemaFor('listReelFriendInteractions') },
    async (request): Promise<components['schemas']['FriendInteractionList']> => {
      const items = await useCases.listReelFriendInteractions.execute({
        viewerId: authenticatedUserId(request),
        postId: request.params.id,
      });
      return { items: items.map((item) => toFriendInteractionResponse(item, urls)) };
    },
  );
}

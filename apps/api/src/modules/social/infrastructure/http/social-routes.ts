import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { Page } from '../../../../shared/domain/pagination.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { AcceptFollowRequest } from '../../application/use-cases/accept-follow-request.ts';
import type { AddCloseFriend } from '../../application/use-cases/add-close-friend.ts';
import type { BlockUser } from '../../application/use-cases/block-user.ts';
import type { DeclineFollowRequest } from '../../application/use-cases/decline-follow-request.ts';
import type { FollowUser } from '../../application/use-cases/follow-user.ts';
import type { ListBlocks } from '../../application/use-cases/list-blocks.ts';
import type { ListCloseFriends } from '../../application/use-cases/list-close-friends.ts';
import type { ListFollowRequests } from '../../application/use-cases/list-follow-requests.ts';
import type { ListFollowers } from '../../application/use-cases/list-followers.ts';
import type { ListFollowing } from '../../application/use-cases/list-following.ts';
import type { RemoveCloseFriend } from '../../application/use-cases/remove-close-friend.ts';
import type { RemoveFollower } from '../../application/use-cases/remove-follower.ts';
import type { SearchUsers } from '../../application/use-cases/search-users.ts';
import type { UnblockUser } from '../../application/use-cases/unblock-user.ts';
import type { UnfollowUser } from '../../application/use-cases/unfollow-user.ts';
import type { UserSummary } from '../../domain/user-summary.ts';

export interface SocialUseCases {
  followUser: FollowUser;
  unfollowUser: UnfollowUser;
  listFollowers: ListFollowers;
  listFollowing: ListFollowing;
  searchUsers: SearchUsers;
  blockUser: BlockUser;
  unblockUser: UnblockUser;
  listBlocks: ListBlocks;
  removeFollower: RemoveFollower;
  listFollowRequests: ListFollowRequests;
  acceptFollowRequest: AcceptFollowRequest;
  declineFollowRequest: DeclineFollowRequest;
  listCloseFriends: ListCloseFriends;
  addCloseFriend: AddCloseFriend;
  removeCloseFriend: RemoveCloseFriend;
}

type UserPage = components['schemas']['UserPage'];

/** Routes du module `social` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerSocialRoutes(
  app: FastifyInstance,
  useCases: SocialUseCases,
  urls: PublicMediaUrls,
): void {
  const toUserSummary = ({
    avatarVariants,
    ...user
  }: UserSummary): components['schemas']['UserSummary'] => ({
    ...user,
    ...(avatarVariants && { avatar: urls.of(avatarVariants) }),
  });

  app.put<{ Params: { id: string } }>(
    '/v1/users/:id/follow',
    { schema: routeSchemaFor('followUser') },
    async (request): Promise<components['schemas']['FollowStatus']> => {
      return useCases.followUser.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/users/:id/follow',
    { schema: routeSchemaFor('unfollowUser') },
    async (request): Promise<components['schemas']['FollowStatus']> => {
      return useCases.unfollowUser.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
      });
    },
  );

  const toUserPage = (page: Page<UserSummary>): UserPage => ({
    items: page.items.map(toUserSummary),
    ...(page.next && { nextCursor: encodeCursor(page.next) }),
  });

  app.put<{ Params: { id: string } }>(
    '/v1/users/:id/block',
    { schema: routeSchemaFor('blockUser') },
    async (request, reply): Promise<void> => {
      await useCases.blockUser.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
      });
      reply.status(204);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/users/:id/block',
    { schema: routeSchemaFor('unblockUser') },
    async (request, reply): Promise<void> => {
      await useCases.unblockUser.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
      });
      reply.status(204);
    },
  );

  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/me/blocks',
    { schema: routeSchemaFor('listBlocks') },
    async (request): Promise<UserPage> => {
      const page = await useCases.listBlocks.execute({
        viewerId: authenticatedUserId(request),
        after: parseCursor(request.query.cursor),
      });
      return toUserPage(page);
    },
  );

  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/me/close-friends',
    { schema: routeSchemaFor('listCloseFriends') },
    async (request): Promise<UserPage> => {
      const page = await useCases.listCloseFriends.execute({
        viewerId: authenticatedUserId(request),
        after: parseCursor(request.query.cursor),
      });
      return toUserPage(page);
    },
  );

  app.put<{ Params: { userId: string } }>(
    '/v1/me/close-friends/:userId',
    { schema: routeSchemaFor('addCloseFriend') },
    async (request, reply): Promise<void> => {
      await useCases.addCloseFriend.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.userId,
      });
      reply.status(204);
    },
  );

  app.delete<{ Params: { userId: string } }>(
    '/v1/me/close-friends/:userId',
    { schema: routeSchemaFor('removeCloseFriend') },
    async (request, reply): Promise<void> => {
      await useCases.removeCloseFriend.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.userId,
      });
      reply.status(204);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/users/:id/follower',
    { schema: routeSchemaFor('removeFollower') },
    async (request, reply): Promise<void> => {
      await useCases.removeFollower.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
      });
      reply.status(204);
    },
  );

  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/me/follow-requests',
    { schema: routeSchemaFor('listFollowRequests') },
    async (request): Promise<UserPage> => {
      const page = await useCases.listFollowRequests.execute({
        viewerId: authenticatedUserId(request),
        after: parseCursor(request.query.cursor),
      });
      return toUserPage(page);
    },
  );

  const decisions = [
    [
      '/v1/follow-requests/:requesterId/accept',
      'acceptFollowRequest',
      useCases.acceptFollowRequest,
    ],
    [
      '/v1/follow-requests/:requesterId/decline',
      'declineFollowRequest',
      useCases.declineFollowRequest,
    ],
  ] as const;
  for (const [path, operationId, useCase] of decisions) {
    app.post<{ Params: { requesterId: string } }>(
      path,
      { schema: routeSchemaFor(operationId) },
      async (request, reply): Promise<void> => {
        await useCase.execute({
          viewerId: authenticatedUserId(request),
          requesterId: request.params.requesterId,
        });
        reply.status(204);
      },
    );
  }

  const lists = [
    ['/v1/users/:id/followers', 'listFollowers', useCases.listFollowers],
    ['/v1/users/:id/following', 'listFollowing', useCases.listFollowing],
  ] as const;
  for (const [path, operationId, useCase] of lists) {
    app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
      path,
      { schema: routeSchemaFor(operationId) },
      async (request): Promise<UserPage> => {
        const page = await useCase.execute({
          viewerId: authenticatedUserId(request),
          userId: request.params.id,
          after: parseCursor(request.query.cursor),
        });
        return toUserPage(page);
      },
    );
  }

  app.get<{ Querystring: { q: string } }>(
    '/v1/search/users',
    { schema: routeSchemaFor('searchUsers') },
    async (request): Promise<components['schemas']['UserSearchResults']> => {
      const users = await useCases.searchUsers.execute({
        viewerId: authenticatedUserId(request),
        query: request.query.q,
      });
      return { items: users.map(toUserSummary) };
    },
  );
}

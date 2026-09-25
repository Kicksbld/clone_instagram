import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { FollowUser } from '../../application/use-cases/follow-user.ts';
import type { ListFollowers } from '../../application/use-cases/list-followers.ts';
import type { ListFollowing } from '../../application/use-cases/list-following.ts';
import type { SearchUsers } from '../../application/use-cases/search-users.ts';
import type { UnfollowUser } from '../../application/use-cases/unfollow-user.ts';
import type { UserSummary } from '../../domain/user-summary.ts';

export interface SocialUseCases {
  followUser: FollowUser;
  unfollowUser: UnfollowUser;
  listFollowers: ListFollowers;
  listFollowing: ListFollowing;
  searchUsers: SearchUsers;
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
        return {
          items: page.items.map(toUserSummary),
          ...(page.next && { nextCursor: encodeCursor(page.next) }),
        };
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

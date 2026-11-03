import type { components, operations } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { DeleteStory } from '../../application/use-cases/delete-story.ts';
import type { GetStoryTray } from '../../application/use-cases/get-story-tray.ts';
import type { GetUserStories } from '../../application/use-cases/get-user-stories.ts';
import type { PublishStory } from '../../application/use-cases/publish-story.ts';
import type { ViewStory } from '../../application/use-cases/view-story.ts';
import type { Story, StoryTrayEntry } from '../../domain/story.ts';

export interface StoriesUseCases {
  publishStory: PublishStory;
  getStoryTray: GetStoryTray;
  getUserStories: GetUserStories;
  viewStory: ViewStory;
  deleteStory: DeleteStory;
}

type Schemas = components['schemas'];
type CreateStoryRequest = operations['createStory']['requestBody']['content']['application/json'];

/** Limite de publication par utilisateur (ADR-005, ADR-025). */
const CREATE_STORY_RATE_LIMIT = { max: 20, timeWindow: '1 hour' } as const;

/** Routes du module `ephemeral` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerStoriesRoutes(
  app: FastifyInstance,
  useCases: StoriesUseCases,
  urls: PublicMediaUrls,
): void {
  const author = ({ id, username, avatarVariants }: StoryTrayEntry['author']) => ({
    id,
    username,
    ...(avatarVariants && { avatar: urls.of(avatarVariants) }),
  });
  const toStory = (story: Story): Schemas['Story'] => ({
    id: story.id,
    author: author(story.author),
    audience: story.audience,
    media: {
      variants: urls.of(story.media.variants),
      width: story.media.width,
      height: story.media.height,
    },
    viewerHasSeen: story.viewerHasSeen,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
  });

  app.post<{ Body: CreateStoryRequest }>(
    '/v1/stories',
    { schema: routeSchemaFor('createStory'), config: { rateLimit: CREATE_STORY_RATE_LIMIT } },
    async (request, reply): Promise<Schemas['Story']> => {
      const story = await useCases.publishStory.execute({
        authorId: authenticatedUserId(request),
        mediaId: request.body.mediaId,
        audience: request.body.audience,
      });
      reply.status(201);
      return toStory(story);
    },
  );

  app.get(
    '/v1/stories/tray',
    { schema: routeSchemaFor('getStoryTray') },
    async (request): Promise<Schemas['StoryTray']> => {
      const entries = await useCases.getStoryTray.execute({
        viewerId: authenticatedUserId(request),
      });
      return {
        items: entries.map((entry) => ({
          author: author(entry.author),
          seen: entry.seen,
          hasCloseFriendsStory: entry.hasCloseFriendsStory,
          latestStoryAt: entry.latestStoryAt.toISOString(),
        })),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/users/:id/stories',
    { schema: routeSchemaFor('listUserStories') },
    async (request): Promise<Schemas['StoryList']> => {
      const stories = await useCases.getUserStories.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
      });
      return { items: stories.map(toStory) };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/stories/:id/view',
    { schema: routeSchemaFor('viewStory') },
    async (request, reply): Promise<void> => {
      await useCases.viewStory.execute({
        viewerId: authenticatedUserId(request),
        storyId: request.params.id,
      });
      reply.status(204);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/stories/:id',
    { schema: routeSchemaFor('deleteStory') },
    async (request, reply): Promise<void> => {
      await useCases.deleteStory.execute({
        authorId: authenticatedUserId(request),
        storyId: request.params.id,
      });
      reply.status(204);
    },
  );
}

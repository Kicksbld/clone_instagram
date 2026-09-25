import { encodeCursor } from '@clone/db';
import type { components, operations } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { CreatePost } from '../../application/use-cases/create-post.ts';
import type { GetPost } from '../../application/use-cases/get-post.ts';
import type { ListUserPosts } from '../../application/use-cases/list-user-posts.ts';
import type { Post } from '../../domain/post.ts';

export interface PostsUseCases {
  createPost: CreatePost;
  getPost: GetPost;
  listUserPosts: ListUserPosts;
}

type PostResponse = components['schemas']['Post'];
type CreatePostRequest = operations['createPost']['requestBody']['content']['application/json'];

/** Limite de publication par utilisateur (ADR-005). */
const CREATE_POST_RATE_LIMIT = { max: 20, timeWindow: '1 hour' } as const;

/** Routes du module `posts` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerPostsRoutes(
  app: FastifyInstance,
  useCases: PostsUseCases,
  urls: PublicMediaUrls,
): void {
  const toPost = (post: Post): PostResponse => {
    if (post.kind !== 'post') throw new Error(`Valeur hors contrat : ${post.kind}`);
    const { avatarVariants } = post.author;
    return {
      id: post.id,
      kind: post.kind,
      caption: post.caption,
      author: {
        id: post.author.id,
        username: post.author.username,
        ...(avatarVariants && { avatar: urls.of(avatarVariants) }),
      },
      media: post.media.map((item) => ({
        variants: urls.of(item.variants),
        width: item.width,
        height: item.height,
      })),
      createdAt: post.createdAt.toISOString(),
    };
  };

  app.post<{ Body: CreatePostRequest }>(
    '/v1/posts',
    { schema: routeSchemaFor('createPost'), config: { rateLimit: CREATE_POST_RATE_LIMIT } },
    async (request, reply): Promise<PostResponse> => {
      const post = await useCases.createPost.execute({
        authorId: authenticatedUserId(request),
        kind: request.body.kind,
        caption: request.body.caption ?? '',
        mediaIds: request.body.mediaIds,
      });
      reply.status(201);
      return toPost(post);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/posts/:id',
    { schema: routeSchemaFor('getPost') },
    async (request): Promise<PostResponse> => {
      const post = await useCases.getPost.execute({
        viewerId: authenticatedUserId(request),
        postId: request.params.id,
      });
      return toPost(post);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/v1/users/:id/posts',
    { schema: routeSchemaFor('listUserPosts') },
    async (request): Promise<components['schemas']['PostPage']> => {
      const page = await useCases.listUserPosts.execute({
        viewerId: authenticatedUserId(request),
        userId: request.params.id,
        after: parseCursor(request.query.cursor),
      });
      return {
        items: page.items.map(toPost),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );
}

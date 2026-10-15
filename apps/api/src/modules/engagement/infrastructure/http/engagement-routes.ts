import { encodeCursor } from '@clone/db';
import type { components, operations } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import type { Page } from '../../../../shared/domain/pagination.ts';
import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { CreateComment } from '../../application/use-cases/create-comment.ts';
import type { DeleteComment } from '../../application/use-cases/delete-comment.ts';
import type { LikePost } from '../../application/use-cases/like-post.ts';
import type { ListComments } from '../../application/use-cases/list-comments.ts';
import type { ListReplies } from '../../application/use-cases/list-replies.ts';
import type { UnlikePost } from '../../application/use-cases/unlike-post.ts';
import type { CommentView } from '../../domain/comment.ts';
import { type CommentResponse, toCommentResponse } from './comment-response.ts';

export interface EngagementUseCases {
  likePost: LikePost;
  unlikePost: UnlikePost;
  createComment: CreateComment;
  listComments: ListComments;
  listReplies: ListReplies;
  deleteComment: DeleteComment;
}

type LikeStatus = components['schemas']['LikeStatus'];
type CommentPage = components['schemas']['CommentPage'];
type CreateCommentRequest =
  operations['createComment']['requestBody']['content']['application/json'];

/** Limite de commentaires par utilisateur (ADR-005). */
const CREATE_COMMENT_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;

/** Routes du module `engagement` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerEngagementRoutes(
  app: FastifyInstance,
  useCases: EngagementUseCases,
  urls: PublicMediaUrls,
): void {
  const toPage = (page: Page<CommentView>): CommentPage => ({
    items: page.items.map((comment) => toCommentResponse(comment, urls)),
    ...(page.next && { nextCursor: encodeCursor(page.next) }),
  });

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

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/v1/posts/:id/comments',
    { schema: routeSchemaFor('listComments') },
    async (request): Promise<CommentPage> => {
      const page = await useCases.listComments.execute({
        viewerId: authenticatedUserId(request),
        postId: request.params.id,
        after: parseCursor(request.query.cursor),
      });
      return toPage(page);
    },
  );

  app.post<{ Params: { id: string }; Body: CreateCommentRequest }>(
    '/v1/posts/:id/comments',
    { schema: routeSchemaFor('createComment'), config: { rateLimit: CREATE_COMMENT_RATE_LIMIT } },
    async (request, reply): Promise<CommentResponse> => {
      const comment = await useCases.createComment.execute({
        authorId: authenticatedUserId(request),
        postId: request.params.id,
        body: request.body.body,
        ...(request.body.parentId && { parentId: request.body.parentId }),
      });
      reply.status(201);
      return toCommentResponse(comment, urls);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/v1/comments/:id/replies',
    { schema: routeSchemaFor('listReplies') },
    async (request): Promise<CommentPage> => {
      const page = await useCases.listReplies.execute({
        viewerId: authenticatedUserId(request),
        commentId: request.params.id,
        after: parseCursor(request.query.cursor),
      });
      return toPage(page);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/comments/:id',
    { schema: routeSchemaFor('deleteComment') },
    async (request, reply): Promise<void> => {
      await useCases.deleteComment.execute({
        viewerId: authenticatedUserId(request),
        commentId: request.params.id,
      });
      reply.status(204);
    },
  );
}

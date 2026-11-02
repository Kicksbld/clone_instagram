import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { GetActivity } from '../../application/use-cases/get-activity.ts';
import type { MarkActivityRead } from '../../application/use-cases/mark-activity-read.ts';
import { type ActivityGroup, isGroupKey } from '../../domain/activity.ts';

type ActivityGroupResponse = components['schemas']['ActivityGroup'];

export interface ActivityUseCases {
  getActivity: GetActivity;
  markActivityRead: MarkActivityRead;
}

/** Routes du module `activity` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerActivityRoutes(
  app: FastifyInstance,
  useCases: ActivityUseCases,
  urls: PublicMediaUrls,
): void {
  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/activity',
    { schema: routeSchemaFor('getActivity') },
    async (request): Promise<components['schemas']['ActivityPage']> => {
      const { page, unreadCount } = await useCases.getActivity.execute({
        viewerId: authenticatedUserId(request),
        // Curseur `(date la plus récente, clé du groupe)` (ADR-026).
        after: parseCursor(request.query.cursor, isGroupKey),
      });
      return {
        items: page.items.map((group) => toGroupResponse(group, urls)),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
        unreadCount,
      };
    },
  );

  app.post(
    '/v1/activity/read',
    { schema: routeSchemaFor('markActivityRead') },
    async (request, reply) => {
      await useCases.markActivityRead.execute({ viewerId: authenticatedUserId(request) });
      reply.status(204);
    },
  );
}

/** Groupe du domaine → schéma `ActivityGroup` du contrat (chemins Storage → URL publiques). */
function toGroupResponse(group: ActivityGroup, urls: PublicMediaUrls): ActivityGroupResponse {
  const { actor, post, comment } = group;
  return {
    id: group.key,
    type: group.type,
    actor: {
      id: actor.id,
      username: actor.username,
      ...(actor.avatar && { avatar: urls.of(actor.avatar) }),
    },
    actorCount: group.actorCount,
    createdAt: group.latestAt.toISOString(),
    read: group.read,
    ...(post && { post: { id: post.id, thumbnail: urls.of(post.thumbnail) } }),
    ...(comment && { comment: { id: comment.id, body: comment.body } }),
  };
}

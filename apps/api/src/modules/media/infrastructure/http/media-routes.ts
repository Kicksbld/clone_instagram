import type { components, operations } from '@clone/contract';
import type { FastifyInstance } from 'fastify';

import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { CompleteUpload } from '../../application/use-cases/complete-upload.ts';
import type { GetMedia } from '../../application/use-cases/get-media.ts';
import type { RequestUpload } from '../../application/use-cases/request-upload.ts';
import type { Media } from '../../domain/media.ts';

export interface MediaUseCases {
  requestUpload: RequestUpload;
  completeUpload: CompleteUpload;
  getMedia: GetMedia;
}

type MediaResponse = components['schemas']['Media'];
type UploadRequest = operations['requestMediaUpload']['requestBody']['content']['application/json'];

/** Valeur d'une énumération du domaine plus large que celle du contrat (ex. `video` avant P1). */
function inContract<T extends string>(value: string, allowed: readonly T[]): T {
  if (!allowed.some((item) => item === value)) {
    throw new Error(`Valeur hors contrat : ${value}`);
  }
  return value as T;
}

function toMediaResponse(media: Media, urls: PublicMediaUrls): MediaResponse {
  return {
    id: media.id,
    kind: inContract(media.kind, ['image'] as const),
    purpose: inContract(media.purpose, ['avatar', 'post'] as const),
    status: media.status,
    ...(media.status === 'ready' && media.variants && { variants: urls.of(media.variants) }),
    ...(media.status === 'failed' && media.failureReason && { failureReason: media.failureReason }),
  };
}

/** Routes du module `media` : authentifiées par le scope `/v1` (voir `app.ts`). */
export function registerMediaRoutes(
  app: FastifyInstance,
  useCases: MediaUseCases,
  urls: PublicMediaUrls,
): void {
  app.post<{ Body: UploadRequest }>(
    '/v1/media/uploads',
    { schema: routeSchemaFor('requestMediaUpload') },
    async (request, reply): Promise<components['schemas']['MediaUploadIntent']> => {
      const intent = await useCases.requestUpload.execute({
        userId: authenticatedUserId(request),
        ...request.body,
      });
      reply.status(201);
      return { ...intent, expiresAt: intent.expiresAt.toISOString() };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/media/:id/complete',
    { schema: routeSchemaFor('completeMediaUpload') },
    async (request): Promise<MediaResponse> => {
      const media = await useCases.completeUpload.execute({
        userId: authenticatedUserId(request),
        mediaId: request.params.id,
      });
      return toMediaResponse(media, urls);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/media/:id',
    { schema: routeSchemaFor('getMedia') },
    async (request): Promise<MediaResponse> => {
      const media = await useCases.getMedia.execute({
        userId: authenticatedUserId(request),
        mediaId: request.params.id,
      });
      return toMediaResponse(media, urls);
    },
  );
}

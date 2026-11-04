import type { FastifyInstance } from 'fastify';
import { encodeCursor } from '@clone/db';
import type { components } from '@clone/contract';
import { authenticatedUserId } from '../../../../shared/infrastructure/auth/authentication.ts';
import { routeSchemaFor } from '../../../../shared/infrastructure/http/contract-schemas.ts';
import { parseCursor } from '../../../../shared/infrastructure/http/cursor.ts';
import type { PublicMediaUrls } from '../../../../shared/infrastructure/http/public-media-urls.ts';
import type { GetOrCreateConversation } from '../../application/use-cases/get-or-create-conversation.ts';
import type { ListConversations } from '../../application/use-cases/list-conversations.ts';
import type { MarkConversationRead } from '../../application/use-cases/mark-conversation-read.ts';
import type { ListMessages } from '../../application/use-cases/list-messages.ts';
import type { SendMessage } from '../../application/use-cases/send-message.ts';
import type { GetMessagePhotoUrl } from '../../application/use-cases/get-message-photo-url.ts';
import type { ConversationPreview } from '../../domain/conversation.ts';
import { messageResponse } from '../../domain/message-response.ts';
export interface MessagingUseCases {
  getOrCreateConversation: GetOrCreateConversation;
  listConversations: ListConversations;
  listMessages: ListMessages;
  sendMessage: SendMessage;
  markConversationRead: MarkConversationRead;
  getMessagePhotoUrl: GetMessagePhotoUrl;
}
export function registerMessagingRoutes(
  app: FastifyInstance,
  useCases: MessagingUseCases,
  urls: PublicMediaUrls,
) {
  const preview = (value: ConversationPreview): components['schemas']['Conversation'] => ({
    id: value.id,
    createdAt: value.createdAt.toISOString(),
    otherMember: {
      id: value.otherMember.id,
      username: value.otherMember.username,
      ...(value.otherMember.avatarVariants && {
        avatar: urls.of(value.otherMember.avatarVariants),
      }),
    },
    ...(value.lastMessage && { lastMessage: messageResponse(value.lastMessage) }),
    unreadCount: value.unreadCount,
    ...(value.otherMemberLastReadMessageId && {
      otherMemberLastReadMessageId: value.otherMemberLastReadMessageId,
    }),
  });
  app.post<{ Body: { userId: string } }>(
    '/v1/conversations',
    { schema: routeSchemaFor('getOrCreateConversation') },
    async (request, reply) => {
      const result = await useCases.getOrCreateConversation.execute({
        viewerId: authenticatedUserId(request),
        userId: request.body.userId,
      });
      return reply.code(result.created ? 201 : 200).send(preview(result.conversation));
    },
  );
  app.get<{ Querystring: { cursor?: string } }>(
    '/v1/conversations',
    { schema: routeSchemaFor('listConversations') },
    async (request) => {
      const page = await useCases.listConversations.execute({
        viewerId: authenticatedUserId(request),
        cursor: parseCursor(request.query.cursor),
      });
      return {
        items: page.items.map(preview),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
        unreadConversationCount: page.unreadConversationCount,
      };
    },
  );
  app.get<{ Params: { id: string }; Querystring: { cursor?: string; after?: string } }>(
    '/v1/conversations/:id/messages',
    { schema: routeSchemaFor('listMessages') },
    async (request) => {
      const page = await useCases.listMessages.execute({
        viewerId: authenticatedUserId(request),
        conversationId: request.params.id,
        cursor: parseCursor(request.query.cursor),
        ...(request.query.after && { after: request.query.after }),
      });
      return {
        items: page.items.map(messageResponse),
        ...(page.next && { nextCursor: encodeCursor(page.next) }),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body:
      | components['schemas']['SendTextMessage']
      | components['schemas']['SendImageMessage']
      | components['schemas']['SendPostShareMessage']
      | components['schemas']['SendStoryReplyMessage'];
  }>(
    '/v1/conversations/:id/messages',
    {
      schema: routeSchemaFor('sendMessage'),
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const result = await useCases.sendMessage.execute({
        viewerId: authenticatedUserId(request),
        conversationId: request.params.id,
        clientId: request.body.clientId,
        content:
          request.body.kind === 'story_reply'
            ? { kind: 'story_reply', storyId: request.body.storyId, body: request.body.body }
            : request.body.kind === 'post_share'
              ? {
                  kind: 'post_share',
                  sharedPostId: request.body.sharedPostId,
                  ...(request.body.body !== undefined && { body: request.body.body }),
                }
              : request.body.kind === 'image'
                ? {
                    kind: 'image',
                    mediaId: request.body.mediaId,
                    ...(request.body.body !== undefined && { body: request.body.body }),
                  }
                : { kind: 'text', body: request.body.body },
      });
      return reply.code(result.created ? 201 : 200).send(messageResponse(result.message));
    },
  );
  app.get<{
    Params: { id: string };
    Querystring: { variant: components['schemas']['ImageVariantName'] };
  }>(
    '/v1/media/:id/signed-url',
    { schema: routeSchemaFor('getMediaSignedUrl') },
    async (request): Promise<components['schemas']['SignedMediaUrl']> => {
      const signed = await useCases.getMessagePhotoUrl.execute({
        viewerId: authenticatedUserId(request),
        mediaId: request.params.id,
        variant: request.query.variant,
      });
      return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
    },
  );
  app.post<{ Params: { id: string }; Body: components['schemas']['MarkConversationReadRequest'] }>(
    '/v1/conversations/:id/read',
    { schema: routeSchemaFor('markConversationRead') },
    async (request, reply) => {
      await useCases.markConversationRead.execute({
        viewerId: authenticatedUserId(request),
        conversationId: request.params.id,
        messageId: request.body.messageId,
      });
      return reply.code(204).send();
    },
  );
}

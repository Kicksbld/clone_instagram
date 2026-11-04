import type { Message } from './conversation.ts';
/** REST and realtime carry the same complete message (ADR-023). */
export function messageResponse(message: Message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    clientId: message.clientId,
    kind: message.kind,
    body: message.body,
    ...(message.mediaId && { mediaId: message.mediaId }),
    createdAt: message.createdAt.toISOString(),
  };
}

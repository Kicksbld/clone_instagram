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
    ...(message.kind === 'post_share' && {
      ...(message.sharedPostId && { sharedPostId: message.sharedPostId }),
      sharedPost: message.sharedPost ?? null,
    }),
    ...(message.kind === 'story_reply' && {
      ...(message.storyId && { storyId: message.storyId }),
      sharedStory: message.sharedStory ?? null,
    }),
    createdAt: message.createdAt.toISOString(),
  };
}

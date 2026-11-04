import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { Clock } from '../../../../shared/application/clock.ts';
import type { RealtimePublisher } from '../../../../shared/application/realtime-publisher.ts';
import type { MessagingScope } from '../ports/messaging-transaction.ts';
import { requireConversation } from '../access.ts';
import { messageResponse } from '../../domain/message-response.ts';
import type { MessageContent } from '../../domain/conversation.ts';
import { attachMediaOrThrow } from '../../../media/application/attach-media.ts';
import { MediaKindMismatchError, MediaNotFoundError } from '../../../media/domain/errors.ts';
export class SendMessage {
  constructor(
    private readonly transaction: UnitOfWork<MessagingScope>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly realtime: RealtimePublisher,
  ) {}
  async execute(input: {
    viewerId: string;
    conversationId: string;
    clientId: string;
    content: MessageContent;
  }) {
    const result = await this.transaction.run(async ({ repository, relationships, media }) => {
      // Assign timestamp and UUID only after the preceding send has committed, so REST catch-up cannot skip a late commit.
      await repository.lockConversation(input.conversationId);
      const conversation = await requireConversation(
        repository,
        relationships,
        input.viewerId,
        input.conversationId,
      );
      const members = [conversation.memberLowId, conversation.memberHighId];
      const { content } = input;
      if (content.kind === 'image') {
        // Retry of a sent photo: its media is already attached, return the message as is.
        const existing = await repository.findByClientId(input.viewerId, input.clientId);
        if (existing) return { message: existing, created: false, members };
        const photo = await media.findById(content.mediaId);
        if (!photo || photo.ownerId !== input.viewerId) throw new MediaNotFoundError();
        if (photo.kind !== 'image') throw new MediaKindMismatchError();
        await attachMediaOrThrow(media, {
          id: content.mediaId,
          ownerId: input.viewerId,
          purpose: 'message',
        });
      }
      const result = await repository.insertMessage({
        id: this.ids.next(),
        conversationId: conversation.id,
        senderId: input.viewerId,
        clientId: input.clientId,
        kind: content.kind,
        body: content.body ?? '',
        mediaId: content.kind === 'image' ? content.mediaId : null,
        createdAt: this.clock.now(),
      });
      return { ...result, members };
    });
    if (result.created)
      this.realtime.publish(result.members, {
        type: 'message.created',
        data: messageResponse(result.message),
      });
    return result;
  }
}

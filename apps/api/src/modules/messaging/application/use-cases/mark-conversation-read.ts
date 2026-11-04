import { NotFoundError } from '../../../../shared/domain/errors.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { RealtimePublisher } from '../../../../shared/application/realtime-publisher.ts';
import type { MessagingScope } from '../ports/messaging-transaction.ts';
import { requireConversation } from '../access.ts';
export class MarkConversationRead {
  constructor(
    private readonly transaction: UnitOfWork<MessagingScope>,
    private readonly realtime: RealtimePublisher,
  ) {}
  async execute(input: { viewerId: string; conversationId: string; messageId: string }) {
    const result = await this.transaction.run(async ({ repository, relationships }) => {
      const conversation = await requireConversation(
        repository,
        relationships,
        input.viewerId,
        input.conversationId,
      );
      const message = await repository.findMessage(input.messageId.toLowerCase());
      if (!message || message.conversationId !== conversation.id)
        throw new NotFoundError('conversation_not_found', 'Conversation introuvable.');
      const advanced = await repository.markRead(input.viewerId, message);
      const otherId =
        conversation.memberLowId === input.viewerId
          ? conversation.memberHighId
          : conversation.memberLowId;
      return { advanced, otherId, message };
    });
    // An older or repeated read changes nothing, so nothing is announced.
    if (result.advanced)
      this.realtime.publish([result.otherId], {
        type: 'conversation.read',
        data: {
          conversationId: result.message.conversationId,
          userId: input.viewerId,
          lastReadMessageId: result.message.id,
        },
      });
  }
}

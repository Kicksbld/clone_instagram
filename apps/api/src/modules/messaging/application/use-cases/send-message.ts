import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { Clock } from '../../../../shared/application/clock.ts';
import type { RealtimePublisher } from '../../../../shared/application/realtime-publisher.ts';
import type { MessagingScope } from '../ports/messaging-transaction.ts';
import { requireConversation } from '../access.ts';
import { messageResponse } from '../../domain/message-response.ts';
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
    body: string;
  }) {
    const result = await this.transaction.run(async ({ repository, relationships }) => {
      // Assign timestamp and UUID only after the preceding send has committed, so REST catch-up cannot skip a late commit.
      await repository.lockConversation(input.conversationId);
      const conversation = await requireConversation(
        repository,
        relationships,
        input.viewerId,
        input.conversationId,
      );
      const result = await repository.insertMessage({
        id: this.ids.next(),
        conversationId: conversation.id,
        senderId: input.viewerId,
        clientId: input.clientId,
        kind: 'text',
        body: input.body,
        createdAt: this.clock.now(),
      });
      return { ...result, members: [conversation.memberLowId, conversation.memberHighId] };
    });
    if (result.created)
      this.realtime.publish(result.members, {
        type: 'message.created',
        data: messageResponse(result.message),
      });
    return result;
  }
}

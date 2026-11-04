import type { SharedPosts } from '../shared-posts.ts';
import { BusinessRuleError } from '../../../../shared/domain/errors.ts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.ts';
import type { IdGenerator } from '../../../../shared/application/id-generator.ts';
import type { Clock } from '../../../../shared/application/clock.ts';
import type { MessagingScope } from '../ports/messaging-transaction.ts';
import { requireRecipient } from '../access.ts';
export class GetOrCreateConversation {
  constructor(
    private readonly transaction: UnitOfWork<MessagingScope>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly sharedPosts: SharedPosts,
  ) {}
  execute(input: { viewerId: string; userId: string }) {
    const userId = input.userId.toLowerCase();
    if (input.viewerId === userId)
      throw new BusinessRuleError('cannot_message_self', 'Vous ne pouvez pas vous écrire.');
    return this.transaction.run(async ({ repository, relationships }) => {
      await requireRecipient(repository, relationships, input.viewerId, userId);
      const [memberLowId, memberHighId] = [input.viewerId, userId].sort() as [string, string];
      const result = await repository.getOrCreate({
        id: this.ids.next(),
        memberLowId,
        memberHighId,
        createdAt: this.clock.now(),
        lastMessageAt: null,
      });
      const preview = await repository.preview(result.conversation, input.viewerId);
      if (preview.lastMessage)
        preview.lastMessage = await this.sharedPosts.resolve(preview.lastMessage, input.viewerId);
      return {
        conversation: preview,
        created: result.created,
      };
    });
  }
}

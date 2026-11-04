import type { PageCursor } from '../../../../shared/domain/pagination.ts';
import type { MessagingRepository } from '../ports/messaging-repository.ts';
export class ListConversations {
  constructor(private readonly repository: MessagingRepository) {}
  async execute(input: { viewerId: string; cursor: PageCursor | null }) {
    const [page, unreadConversationCount] = await Promise.all([
      this.repository.listConversations(input.viewerId, input.cursor),
      this.repository.unreadConversationCount(input.viewerId),
    ]);
    return { ...page, unreadConversationCount };
  }
}

import type { SharedPosts } from '../shared-posts.ts';
import type { PageCursor } from '../../../../shared/domain/pagination.ts';
import type { MessagingRepository } from '../ports/messaging-repository.ts';
export class ListConversations {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly sharedPosts: SharedPosts,
  ) {}
  async execute(input: { viewerId: string; cursor: PageCursor | null }) {
    const [page, unreadConversationCount] = await Promise.all([
      this.repository.listConversations(input.viewerId, input.cursor),
      this.repository.unreadConversationCount(input.viewerId),
    ]);
    return {
      ...page,
      items: await Promise.all(
        page.items.map(async (conversation) => ({
          ...conversation,
          ...(conversation.lastMessage && {
            lastMessage: await this.sharedPosts.resolve(conversation.lastMessage, input.viewerId),
          }),
        })),
      ),
      unreadConversationCount,
    };
  }
}

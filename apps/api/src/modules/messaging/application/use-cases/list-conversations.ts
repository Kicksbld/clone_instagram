import type { PageCursor } from '../../../../shared/domain/pagination.ts';
import type { MessagingRepository } from '../ports/messaging-repository.ts';
export class ListConversations {
  constructor(private readonly repository: MessagingRepository) {}
  execute(input: { viewerId: string; cursor: PageCursor | null }) {
    return this.repository.listConversations(input.viewerId, input.cursor);
  }
}

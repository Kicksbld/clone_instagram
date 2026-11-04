import type { MessageReferences } from '../message-references.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { PageCursor } from '../../../../shared/domain/pagination.ts';
import { InvalidCursorError } from '../../../../shared/domain/pagination.ts';
import type { MessagingRepository } from '../ports/messaging-repository.ts';
import { requireConversation } from '../access.ts';
export class ListMessages {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly relationships: RelationshipReader,
    private readonly messageReferences: MessageReferences,
  ) {}
  async execute(input: {
    viewerId: string;
    conversationId: string;
    cursor: PageCursor | null;
    after?: string;
  }) {
    await requireConversation(
      this.repository,
      this.relationships,
      input.viewerId,
      input.conversationId,
    );
    let cursor = input.cursor;
    if (input.after) {
      const anchor = await this.repository.findMessage(input.after);
      if (!anchor || anchor.conversationId !== input.conversationId) throw new InvalidCursorError();
      if (!cursor) cursor = { createdAt: anchor.createdAt, id: anchor.id };
      else if (
        cursor.createdAt < anchor.createdAt ||
        (cursor.createdAt.getTime() === anchor.createdAt.getTime() && cursor.id < anchor.id)
      )
        throw new InvalidCursorError();
    }
    const page = await this.repository.listMessages(
      input.conversationId,
      cursor,
      input.after !== undefined,
    );
    return {
      ...page,
      items: await Promise.all(
        page.items.map((message) => this.messageReferences.resolve(message, input.viewerId)),
      ),
    };
  }
}

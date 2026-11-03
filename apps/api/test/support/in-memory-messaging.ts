import type { MessagingRepository } from '../../src/modules/messaging/application/ports/messaging-repository.ts';
import type {
  Conversation,
  ConversationPreview,
  Message,
} from '../../src/modules/messaging/domain/conversation.ts';
import type { PageCursor } from '../../src/shared/domain/pagination.ts';
import { canMessage } from '../../src/shared/domain/visibility.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';
export class InMemoryMessaging implements MessagingRepository {
  conversations = new Map<string, Conversation>();
  messages = new Map<string, Message>();
  constructor(
    private profiles: InMemoryProfileRepository,
    private relationships: InMemoryRelationshipReader,
  ) {}
  account(id: string) {
    return Promise.resolve(this.profiles.rows.get(id) ?? null);
  }
  lockConversation(): Promise<void> {
    return Promise.resolve();
  }
  findConversation(id: string) {
    return Promise.resolve(this.conversations.get(id) ?? null);
  }
  getOrCreate(conversation: Conversation) {
    const existing = [...this.conversations.values()].find(
      (c) =>
        c.memberLowId === conversation.memberLowId && c.memberHighId === conversation.memberHighId,
    );
    if (existing) return Promise.resolve({ conversation: existing, created: false });
    this.conversations.set(conversation.id, conversation);
    return Promise.resolve({ conversation, created: true });
  }
  preview(conversation: Conversation, viewerId: string): Promise<ConversationPreview> {
    const other = this.profiles.rows.get(
      conversation.memberLowId === viewerId ? conversation.memberHighId : conversation.memberLowId,
    );
    if (!other) throw new Error('Missing member');
    const lastMessage = [...this.messages.values()]
      .filter((m) => m.conversationId === conversation.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
    return Promise.resolve({
      id: conversation.id,
      createdAt: conversation.createdAt,
      otherMember: { id: other.id, username: other.username, avatarVariants: null },
      ...(lastMessage && { lastMessage }),
    });
  }
  async listConversations(viewerId: string, cursor: PageCursor | null) {
    const visible: Conversation[] = [];
    for (const c of this.conversations.values()) {
      if (!c.lastMessageAt || (viewerId !== c.memberLowId && viewerId !== c.memberHighId)) continue;
      const other = await this.account(c.memberLowId === viewerId ? c.memberHighId : c.memberLowId);
      if (
        other &&
        canMessage(viewerId, other, await this.relationships.between(viewerId, other.id))
      )
        visible.push(c);
    }
    const rows = visible
      .filter(
        (c) =>
          !cursor ||
          (c.lastMessageAt ?? c.createdAt) < cursor.createdAt ||
          ((c.lastMessageAt ?? c.createdAt).getTime() === cursor.createdAt.getTime() &&
            c.id < cursor.id),
      )
      .sort(
        (a, b) =>
          (b.lastMessageAt ?? b.createdAt).getTime() - (a.lastMessageAt ?? a.createdAt).getTime() ||
          b.id.localeCompare(a.id),
      );
    const last = rows[19];
    return {
      items: await Promise.all(rows.slice(0, 20).map((c) => this.preview(c, viewerId))),
      next:
        rows.length > 20 && last
          ? { id: last.id, createdAt: last.lastMessageAt ?? last.createdAt }
          : null,
    };
  }
  findMessage(id: string) {
    return Promise.resolve(this.messages.get(id) ?? null);
  }
  insertMessage(message: Message) {
    const existing = [...this.messages.values()].find(
      (m) => m.senderId === message.senderId && m.clientId === message.clientId,
    );
    if (existing) return Promise.resolve({ message: existing, created: false });
    this.messages.set(message.id, message);
    const conversation = this.conversations.get(message.conversationId);
    if (!conversation) throw new Error('Missing conversation');
    conversation.lastMessageAt = message.createdAt;
    return Promise.resolve({ message, created: true });
  }
  listMessages(conversationId: string, cursor: PageCursor | null, forward: boolean) {
    const rows = [...this.messages.values()]
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .filter(
        (m) =>
          !cursor ||
          (forward
            ? m.createdAt > cursor.createdAt ||
              (m.createdAt.getTime() === cursor.createdAt.getTime() && m.id > cursor.id)
            : m.createdAt < cursor.createdAt ||
              (m.createdAt.getTime() === cursor.createdAt.getTime() && m.id < cursor.id)),
      );
    if (!forward) rows.reverse();
    const limit = forward ? 100 : 30,
      last = rows[limit - 1];
    return Promise.resolve({
      items: rows.slice(0, limit),
      next: rows.length > limit && last ? { id: last.id, createdAt: last.createdAt } : null,
    });
  }
}

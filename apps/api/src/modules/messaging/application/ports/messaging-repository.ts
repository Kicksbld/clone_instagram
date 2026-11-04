import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { VisibilitySubject } from '../../../../shared/domain/visibility.ts';
import type { Conversation, ConversationPreview, Message } from '../../domain/conversation.ts';

export interface MessagingRepository {
  account(id: string): Promise<VisibilitySubject | null>;
  lockConversation(id: string): Promise<void>;
  findConversation(id: string): Promise<Conversation | null>;
  getOrCreate(
    conversation: Conversation,
  ): Promise<{ conversation: Conversation; created: boolean }>;
  preview(conversation: Conversation, viewerId: string): Promise<ConversationPreview>;
  listConversations(
    viewerId: string,
    cursor: PageCursor | null,
  ): Promise<Page<ConversationPreview>>;
  /** Total of visible conversations with at least one unread message (Messages tab badge). */
  unreadConversationCount(viewerId: string): Promise<number>;
  /** Moves the read position forward to `message` only if it is newer; returns whether it moved. */
  markRead(userId: string, message: Message): Promise<boolean>;
  findMessage(id: string): Promise<Message | null>;
  insertMessage(message: Message): Promise<{ message: Message; created: boolean }>;
  listMessages(
    conversationId: string,
    cursor: PageCursor | null,
    forward: boolean,
  ): Promise<Page<Message>>;
}

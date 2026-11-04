import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  clientId: string;
  kind: 'text';
  body: string;
  createdAt: Date;
}
export interface Conversation {
  id: string;
  memberLowId: string;
  memberHighId: string;
  createdAt: Date;
  lastMessageAt: Date | null;
}
export interface ConversationPreview {
  id: string;
  createdAt: Date;
  otherMember: { id: string; username: string; avatarVariants: ImageVariantPaths | null };
  lastMessage?: Message;
  /** Messages from the other member newer than the viewer's read position (ADR-023). */
  unreadCount: number;
  /** The other member's read position, shown as « Vu » under that message. */
  otherMemberLastReadMessageId: string | null;
}

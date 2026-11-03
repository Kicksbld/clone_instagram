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
}

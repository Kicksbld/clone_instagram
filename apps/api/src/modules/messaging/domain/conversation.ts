import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';

export type MessageKind = 'text' | 'image' | 'post_share' | 'story_reply';

export interface SharedPost {
  id: string;
  kind: string;
  caption: string;
  author: { id: string; username: string };
  thumbnail?: string;
}

export interface SharedStory {
  id: string;
  author: { id: string; username: string };
  thumbnail: string;
  expiresAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  clientId: string;
  kind: MessageKind;
  /** Empty for a photo sent without text (ADR-023). */
  body: string;
  /** Photo of an `image` message, read through a signed URL only. */
  mediaId: string | null;
  storyId?: string | null;
  sharedStory?: SharedStory | null;
  sharedPostId?: string | null;
  sharedPost?: SharedPost | null;
  createdAt: Date;
}

/** Content of a message to send, by `kind` (ADR-023). */
export type MessageContent =
  | { kind: 'story_reply'; storyId: string; body: string }
  | { kind: 'text'; body: string }
  | { kind: 'image'; mediaId: string; body?: string }
  | { kind: 'post_share'; sharedPostId: string; body?: string };
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

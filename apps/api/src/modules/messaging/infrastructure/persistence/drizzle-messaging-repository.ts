import {
  conversations,
  conversationMembers,
  messages,
  profiles,
  media,
  blocks,
  type Executor,
} from '@clone/db';
import { and, asc, desc, eq, gt, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { Conversation, ConversationPreview, Message } from '../../domain/conversation.ts';
import type { MessagingRepository } from '../../application/ports/messaging-repository.ts';

export class DrizzleMessagingRepository implements MessagingRepository {
  constructor(private readonly db: Executor) {}
  async account(id: string) {
    const [row] = await this.db
      .select({ id: profiles.id, status: profiles.status, isPrivate: profiles.isPrivate })
      .from(profiles)
      .where(eq(profiles.id, id));
    return row ?? null;
  }
  async lockConversation(id: string): Promise<void> {
    await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .for('update');
  }
  async findConversation(id: string) {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id));
    return row ?? null;
  }
  async getOrCreate(conversation: Conversation) {
    const [inserted] = await this.db
      .insert(conversations)
      .values(conversation)
      .onConflictDoNothing({ target: [conversations.memberLowId, conversations.memberHighId] })
      .returning();
    if (inserted) {
      await this.db.insert(conversationMembers).values(
        [conversation.memberLowId, conversation.memberHighId].map((userId) => ({
          conversationId: conversation.id,
          userId,
        })),
      );
      return { conversation: inserted, created: true };
    }
    const [existing] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.memberLowId, conversation.memberLowId),
          eq(conversations.memberHighId, conversation.memberHighId),
        ),
      );
    if (!existing) throw new Error('Conversation missing after conflict');
    return { conversation: existing, created: false };
  }
  async preview(conversation: Conversation, viewerId: string): Promise<ConversationPreview> {
    const otherId =
      conversation.memberLowId === viewerId ? conversation.memberHighId : conversation.memberLowId;
    const [other] = await this.db
      .select({ id: profiles.id, username: profiles.username, variants: media.variants })
      .from(profiles)
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(eq(profiles.id, otherId));
    if (!other) throw new Error('Conversation member missing');
    const [lastMessage] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1);
    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      otherMember: {
        id: other.id,
        username: other.username,
        avatarVariants: other.variants && 'thumb' in other.variants ? other.variants : null,
      },
      ...(lastMessage && { lastMessage }),
    };
  }
  async listConversations(
    viewerId: string,
    cursor: PageCursor | null,
  ): Promise<Page<ConversationPreview>> {
    // SQL translation of canMessage: both members active, neither direction blocked. Privacy does not restrict messages.
    const otherId = sql`CASE WHEN ${conversations.memberLowId} = ${viewerId} THEN ${conversations.memberHighId} ELSE ${conversations.memberLowId} END`;
    const rows = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          or(eq(conversations.memberLowId, viewerId), eq(conversations.memberHighId, viewerId)),
          isNotNull(conversations.lastMessageAt),
          sql`EXISTS (SELECT 1 FROM ${profiles} p WHERE p.id = ${viewerId} AND p.status = 'active')`,
          sql`EXISTS (SELECT 1 FROM ${profiles} p WHERE p.id = ${otherId} AND p.status = 'active')`,
          sql`NOT EXISTS (SELECT 1 FROM ${blocks} b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${otherId}) OR (b.blocker_id = ${otherId} AND b.blocked_id = ${viewerId}))`,
          cursor
            ? sql`(${conversations.lastMessageAt}, ${conversations.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
      .limit(21);
    const items = await Promise.all(rows.slice(0, 20).map((row) => this.preview(row, viewerId)));
    const last = rows[19];
    return {
      items,
      next:
        rows.length > 20 && last?.lastMessageAt
          ? { createdAt: last.lastMessageAt, id: last.id }
          : null,
    };
  }
  async findMessage(id: string) {
    const [row] = await this.db.select().from(messages).where(eq(messages.id, id));
    return row ?? null;
  }
  async insertMessage(message: Message) {
    const [inserted] = await this.db
      .insert(messages)
      .values(message)
      .onConflictDoNothing({ target: [messages.senderId, messages.clientId] })
      .returning();
    if (inserted) {
      await this.db
        .update(conversations)
        .set({
          lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${message.createdAt.toISOString()}::timestamptz)`,
        })
        .where(eq(conversations.id, message.conversationId));
      return { message: inserted, created: true };
    }
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.senderId, message.senderId), eq(messages.clientId, message.clientId)));
    if (!existing) throw new Error('Message missing after conflict');
    return { message: existing, created: false };
  }
  async listMessages(
    conversationId: string,
    cursor: PageCursor | null,
    forward: boolean,
  ): Promise<Page<Message>> {
    const compare = forward ? gt : lt;
    const order = forward ? asc : desc;
    const limit = forward ? 100 : 30;
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          cursor
            ? or(
                compare(messages.createdAt, cursor.createdAt),
                and(eq(messages.createdAt, cursor.createdAt), compare(messages.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(order(messages.createdAt), order(messages.id))
      .limit(limit + 1);
    const last = rows[limit - 1];
    return {
      items: rows.slice(0, limit),
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}

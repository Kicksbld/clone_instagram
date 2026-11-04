import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.ts';
import { media } from './media.ts';
import { posts } from './posts.ts';
import { stories } from './ephemeral.ts';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    memberLowId: uuid('member_low_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    memberHighId: uuid('member_high_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, precision: 3 }),
  },
  (t) => [
    unique('conversations_pair_key').on(t.memberLowId, t.memberHighId),
    check('conversations_ordered_pair', sql`${t.memberLowId} < ${t.memberHighId}`),
    index('conversations_recent_idx').on(t.lastMessageAt.desc(), t.id.desc()),
  ],
).enableRLS();

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    kind: text('kind', { enum: ['text', 'image'] }).notNull(),
    body: text('body').notNull(),
    mediaId: uuid('media_id').references(() => media.id),
    sharedPostId: uuid('shared_post_id').references(() => posts.id),
    storyId: uuid('story_id').references(() => stories.id),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    unique('messages_sender_client_key').on(t.senderId, t.clientId),
    unique('messages_conversation_id_key').on(t.conversationId, t.id),
    // Colonnes renseignées selon `kind` (ADR-023) ; photo sans texte : `body` vide.
    check(
      'messages_kind_fields',
      sql`${t.sharedPostId} IS NULL AND ${t.storyId} IS NULL AND (
        (${t.kind} = 'text' AND char_length(${t.body}) BETWEEN 1 AND 1000 AND ${t.mediaId} IS NULL)
        OR (${t.kind} = 'image' AND char_length(${t.body}) <= 1000 AND ${t.mediaId} IS NOT NULL)
      )`,
    ),
    // Un média ne sert qu'à un message ; lecture de l'URL signée par média (ADR-023).
    uniqueIndex('messages_media_id_key')
      .on(t.mediaId)
      .where(sql`${t.mediaId} IS NOT NULL`),
    index('messages_history_idx').on(t.conversationId, t.createdAt.desc(), t.id.desc()),
  ],
).enableRLS();

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    foreignKey({
      columns: [t.conversationId, t.lastReadMessageId],
      foreignColumns: [messages.conversationId, messages.id],
    }),
  ],
).enableRLS();

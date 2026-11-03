import { newId } from '../ids.ts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../client.ts';
import { conversations, conversationMembers, messages } from '../schema/index.ts';
import { fixedId } from './fixed-profiles.ts';

/** Idempotent examples; pair conflicts also support an already opened demo conversation. */
export async function writeMessagingSeed(db: Executor, viewerId: string | null) {
  const pairs = [
    [fixedId('lea'), fixedId('hugo')],
    [fixedId('lea'), fixedId('chloe')],
    ...(viewerId ? [[viewerId, fixedId('lea')]] : []),
  ];
  for (const [index, pair] of pairs.entries()) {
    const [low, high] = pair.sort();
    if (!low || !high || low === high) continue;
    const id = newId();
    await db
      .insert(conversations)
      .values({ id, memberLowId: low, memberHighId: high })
      .onConflictDoNothing();
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.memberLowId, low), eq(conversations.memberHighId, high)));
    if (!conversation) throw new Error('Seed conversation missing');
    await db
      .insert(conversationMembers)
      .values([low, high].map((userId) => ({ conversationId: conversation.id, userId })))
      .onConflictDoNothing();
    const lines = ['Bonjour ! Comment vas-tu ?', 'Très bien, merci !'];
    for (const [n, body] of lines.entries()) {
      const messageId = newId();
      await db
        .insert(messages)
        .values({
          id: messageId,
          conversationId: conversation.id,
          senderId: n === 0 ? low : high,
          clientId: conversation.id,
          kind: 'text',
          body,
          createdAt: new Date(Date.UTC(2026, 9, 1, 12, index, n)),
        })
        .onConflictDoNothing();
    }
    await db
      .update(conversations)
      .set({
        lastMessageAt: sql`(SELECT max(${messages.createdAt}) FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id})`,
      })
      .where(inArray(conversations.id, [conversation.id]));
  }
}

import { comments, mentions, notifications, type Executor } from '@clone/db';
import { and, eq, inArray, or } from 'drizzle-orm';

/** Called within content deletion transactions, including moderation. */
export async function deleteContentMentions(
  db: Executor,
  target: 'post' | 'comment',
  id: string,
): Promise<void> {
  const children = await db
    .select({ id: comments.id })
    .from(comments)
    .where(
      target === 'post'
        ? eq(comments.postId, id)
        : or(eq(comments.id, id), eq(comments.parentId, id)),
    );
  const childIds = children.map((row) => row.id);
  await db
    .delete(mentions)
    .where(
      or(
        target === 'post' ? eq(mentions.postId, id) : undefined,
        childIds.length ? inArray(mentions.commentId, childIds) : undefined,
      ),
    );
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.type, 'mention'),
        or(
          target === 'post' ? eq(notifications.postId, id) : undefined,
          childIds.length ? inArray(notifications.commentId, childIds) : undefined,
        ),
      ),
    );
}

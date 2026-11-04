import { blocks, media, mentions, profiles, type Executor } from '@clone/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Mention } from '../../domain/mention.ts';

/** Batch projection shared by content readers; translates canViewProfile (ADR-006). */
export async function visibleMentions(
  db: Executor,
  viewerId: string,
  target: 'post' | 'comment',
  ids: string[],
): Promise<Map<string, Mention[]>> {
  const result = new Map<string, Mention[]>();
  if (!ids.length) return result;
  const column = target === 'post' ? mentions.postId : mentions.commentId;
  const rows = await db
    .select({
      targetId: column,
      textUsername: mentions.textUsername,
      id: profiles.id,
      username: profiles.username,
      avatarVariants: media.variants,
    })
    .from(mentions)
    .innerJoin(profiles, eq(profiles.id, mentions.mentionedUserId))
    .leftJoin(media, eq(media.id, profiles.avatarMediaId))
    .where(
      and(
        inArray(column, ids),
        sql`(${profiles.id} = ${viewerId} OR (${profiles.status} = 'active' AND NOT EXISTS (SELECT 1 FROM ${blocks} AS b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${profiles.id}) OR (b.blocker_id = ${profiles.id} AND b.blocked_id = ${viewerId}))))`,
      ),
    )
    .orderBy(mentions.id);
  for (const row of rows) {
    if (!row.targetId) continue;
    const users = result.get(row.targetId) ?? [];
    users.push({
      id: row.id,
      username: row.username,
      textUsername: row.textUsername,
      avatarVariants:
        row.avatarVariants && 'thumb' in row.avatarVariants ? row.avatarVariants : null,
    });
    result.set(row.targetId, users);
  }
  return result;
}

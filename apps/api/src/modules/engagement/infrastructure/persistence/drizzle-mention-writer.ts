import { media, mentions, newId, profiles, type Executor } from '@clone/db';
import { and, eq, inArray } from 'drizzle-orm';
import type {
  MentionWriter,
  MentionTarget,
  StoredMention,
} from '../../../../shared/application/mention-writer.ts';

const targetColumn = (target: MentionTarget) =>
  target.postId !== undefined
    ? eq(mentions.postId, target.postId)
    : eq(mentions.commentId, target.commentId);

export class DrizzleMentionWriter implements MentionWriter {
  constructor(private readonly db: Executor) {}

  async findUsers(usernames: string[]) {
    if (!usernames.length) return [];
    const rows = await this.db
      .select({
        id: profiles.id,
        username: profiles.username,
        status: profiles.status,
        isPrivate: profiles.isPrivate,
        avatarVariants: media.variants,
      })
      .from(profiles)
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(inArray(profiles.username, usernames));
    return rows.map((row) => ({
      ...row,
      avatarVariants:
        row.avatarVariants && 'thumb' in row.avatarVariants ? row.avatarVariants : null,
    }));
  }

  list(target: MentionTarget): Promise<StoredMention[]> {
    return this.db
      .select({ id: mentions.mentionedUserId, textUsername: mentions.textUsername })
      .from(mentions)
      .where(targetColumn(target))
      .orderBy(mentions.createdAt, mentions.id);
  }

  async remove(target: MentionTarget, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    await this.db
      .delete(mentions)
      .where(and(targetColumn(target), inArray(mentions.mentionedUserId, userIds)));
  }

  async write(input: {
    authorId: string;
    target: MentionTarget;
    users: StoredMention[];
  }): Promise<void> {
    if (!input.users.length) return;
    await this.db
      .insert(mentions)
      .values(
        input.users.map((user) => ({
          id: newId(),
          authorId: input.authorId,
          mentionedUserId: user.id,
          textUsername: user.textUsername,
          ...input.target,
        })),
      )
      .onConflictDoNothing();
  }
}

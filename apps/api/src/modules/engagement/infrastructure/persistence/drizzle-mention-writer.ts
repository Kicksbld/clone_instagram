import { media, mentions, newId, profiles, type Executor } from '@clone/db';
import { eq, inArray } from 'drizzle-orm';
import type {
  MentionWriter,
  MentionTarget,
} from '../../../../shared/application/mention-writer.ts';

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

  async write(input: {
    authorId: string;
    target: MentionTarget;
    users: { id: string; textUsername: string }[];
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

import type {
  MentionWriter,
  MentionTarget,
  StoredMention,
} from '../../src/shared/application/mention-writer.ts';

const keyOf = (target: MentionTarget) =>
  target.commentId ? `comment:${target.commentId}` : `post:${target.postId}`;
import type { Mention } from '../../src/shared/domain/mention.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';
import type { InMemoryComments } from './in-memory-comments.ts';

export class InMemoryMentions implements MentionWriter {
  private readonly rows = new Map<string, { id: string; textUsername: string }[]>();
  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly relationships: InMemoryRelationshipReader,
    posts: InMemoryPosts,
    comments?: InMemoryComments,
  ) {
    posts.mentionReader = (id, viewerId) => this.visible(`post:${id}`, viewerId);
    if (comments)
      comments.mentionReader = (id, viewerId) => this.visible(`comment:${id}`, viewerId);
  }
  findUsers(usernames: string[]) {
    return Promise.resolve(
      [...this.profiles.rows.values()]
        .filter((user) => usernames.includes(user.username))
        .map((user) => ({
          id: user.id,
          username: user.username,
          status: user.status,
          isPrivate: user.isPrivate,
          avatarVariants: user.avatar?.variants ?? null,
        })),
    );
  }
  list(target: MentionTarget): Promise<StoredMention[]> {
    return Promise.resolve([...(this.rows.get(keyOf(target)) ?? [])]);
  }
  write(input: { authorId: string; target: MentionTarget; users: StoredMention[] }): Promise<void> {
    const key = keyOf(input.target);
    const rows = this.rows.get(key) ?? [];
    this.rows.set(key, [
      ...rows,
      ...input.users.filter((user) => !rows.some((row) => row.id === user.id)),
    ]);
    return Promise.resolve();
  }
  remove(target: MentionTarget, userIds: string[]): Promise<void> {
    const key = keyOf(target);
    this.rows.set(
      key,
      (this.rows.get(key) ?? []).filter((row) => !userIds.includes(row.id)),
    );
    return Promise.resolve();
  }
  private visible(key: string, viewerId: string): Mention[] {
    return (this.rows.get(key) ?? []).flatMap(({ id, textUsername }) => {
      const user = this.profiles.rows.get(id);
      return user &&
        (id === viewerId ||
          (user.status === 'active' && !this.relationships.isBlockedEitherWay(viewerId, id)))
        ? [
            {
              id,
              username: user.username,
              textUsername,
              avatarVariants: user.avatar?.variants ?? null,
            },
          ]
        : [];
    });
  }
}

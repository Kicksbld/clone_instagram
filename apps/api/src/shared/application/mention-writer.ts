import type { Mention } from '../domain/mention.ts';
import type { VisibilitySubject } from '../domain/visibility.ts';

export type MentionTarget =
  { postId: string; commentId?: never } | { commentId: string; postId?: never };

/** A mention as stored: the mentioned account and the username written in the text (ADR-036). */
export interface StoredMention {
  id: string;
  textUsername: string;
}

/** Transaction-scoped port owned by engagement (ADR-025). */
export interface MentionWriter {
  findUsers(usernames: string[]): Promise<(Mention & VisibilitySubject)[]>;
  /** Current mentions of the target, whatever their visibility. */
  list(target: MentionTarget): Promise<StoredMention[]>;
  write(input: { authorId: string; target: MentionTarget; users: StoredMention[] }): Promise<void>;
  /** Deletes the target's mentions of these accounts; no effect on missing ones. */
  remove(target: MentionTarget, userIds: string[]): Promise<void>;
}

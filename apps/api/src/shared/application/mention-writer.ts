import type { Mention } from '../domain/mention.ts';
import type { VisibilitySubject } from '../domain/visibility.ts';

export type MentionTarget =
  { postId: string; commentId?: never } | { commentId: string; postId?: never };

/** Transaction-scoped port owned by engagement (ADR-025). */
export interface MentionWriter {
  findUsers(usernames: string[]): Promise<(Mention & VisibilitySubject)[]>;
  write(input: {
    authorId: string;
    target: MentionTarget;
    users: { id: string; textUsername: string }[];
  }): Promise<void>;
}

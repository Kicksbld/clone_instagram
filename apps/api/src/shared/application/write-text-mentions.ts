import { mentionedUsernames } from '../domain/mention.ts';
import type { CreatedNotification } from '../domain/notification.ts';
import { canViewContent, canViewProfile, type VisibilitySubject } from '../domain/visibility.ts';
import type { MentionWriter, MentionTarget, StoredMention } from './mention-writer.ts';
import type { NotificationWriter } from './notification-writer.ts';
import type { RelationshipReader } from './relationship-reader.ts';

/**
 * Writes the mentions of a text within the action's transaction (ADR-025) and notifies the new
 * ones. With `previous` (caption edit), a mention whose written username is still in the text is
 * kept as is (ADR-036: a renamed account stays linked, no new notification); an account written
 * under its new username keeps its mention, rewritten, without a new notification; the others
 * are deleted with their notification (ADR-037).
 */
export async function writeTextMentions(
  input: {
    text: string;
    authorId: string;
    contentAuthor: VisibilitySubject;
    postId: string;
    target: MentionTarget;
    alreadyNotifiedId?: string;
    previous?: StoredMention[];
  },
  scope: {
    mentions: MentionWriter;
    relationships: RelationshipReader;
    notifications: NotificationWriter;
  },
): Promise<CreatedNotification[]> {
  const usernames = mentionedUsernames(input.text);
  const previous = input.previous ?? [];
  const kept = previous.filter((mention) => usernames.includes(mention.textUsername));
  const commentId = input.target.commentId;

  const toResolve = usernames.filter(
    (username) => !kept.some((mention) => mention.textUsername === username),
  );
  const candidates = await scope.mentions.findUsers(toResolve);
  const users: StoredMention[] = [];
  const toNotify: string[] = [];
  for (const username of toResolve) {
    const user = candidates.find((candidate) => candidate.username.toLowerCase() === username);
    if (
      !user ||
      kept.some((mention) => mention.id === user.id) ||
      users.some((mention) => mention.id === user.id) ||
      !canViewProfile(
        input.authorId,
        user,
        await scope.relationships.between(input.authorId, user.id),
      )
    )
      continue;
    users.push({ id: user.id, textUsername: username });
    // Already mentioned under a former username: same mention, rewritten, not notified again.
    if (
      user.id === input.alreadyNotifiedId ||
      previous.some((mention) => mention.id === user.id) ||
      !canViewContent(
        user.id,
        input.contentAuthor,
        await scope.relationships.between(user.id, input.contentAuthor.id),
      )
    )
      continue;
    toNotify.push(user.id);
  }

  const replaced = previous.filter((mention) => !kept.includes(mention));
  if (replaced.length) {
    await scope.mentions.remove(
      input.target,
      replaced.map((mention) => mention.id),
    );
    for (const mention of replaced) {
      if (users.some((user) => user.id === mention.id)) continue;
      await scope.notifications.retract({
        recipientId: mention.id,
        actorId: input.authorId,
        type: 'mention',
        postId: input.postId,
        ...(commentId && { commentId }),
      });
    }
  }

  const notifications: CreatedNotification[] = [];
  for (const recipientId of toNotify) {
    const notification = await scope.notifications.notify({
      recipientId,
      actorId: input.authorId,
      type: 'mention',
      postId: input.postId,
      ...(commentId && { commentId }),
    });
    if (notification) notifications.push(notification);
  }
  await scope.mentions.write({ authorId: input.authorId, target: input.target, users });
  return notifications;
}

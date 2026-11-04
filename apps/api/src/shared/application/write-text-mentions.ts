import { mentionedUsernames } from '../domain/mention.ts';
import type { CreatedNotification } from '../domain/notification.ts';
import { canViewContent, canViewProfile, type VisibilitySubject } from '../domain/visibility.ts';
import type { MentionWriter, MentionTarget } from './mention-writer.ts';
import type { NotificationWriter } from './notification-writer.ts';
import type { RelationshipReader } from './relationship-reader.ts';

export async function writeTextMentions(
  input: {
    text: string;
    authorId: string;
    contentAuthor: VisibilitySubject;
    postId: string;
    target: MentionTarget;
    alreadyNotifiedId?: string;
  },
  scope: {
    mentions: MentionWriter;
    relationships: RelationshipReader;
    notifications: NotificationWriter;
  },
): Promise<CreatedNotification[]> {
  const usernames = mentionedUsernames(input.text);
  const candidates = await scope.mentions.findUsers(usernames);
  const users = [];
  const notifications: CreatedNotification[] = [];
  for (const username of usernames) {
    const user = candidates.find((candidate) => candidate.username.toLowerCase() === username);
    if (
      !user ||
      !canViewProfile(
        input.authorId,
        user,
        await scope.relationships.between(input.authorId, user.id),
      )
    )
      continue;
    users.push({ id: user.id, textUsername: username });
    if (
      user.id === input.alreadyNotifiedId ||
      !canViewContent(
        user.id,
        input.contentAuthor,
        await scope.relationships.between(user.id, input.contentAuthor.id),
      )
    )
      continue;
    const notification = await scope.notifications.notify({
      recipientId: user.id,
      actorId: input.authorId,
      type: 'mention',
      postId: input.postId,
      ...(input.target.commentId && { commentId: input.target.commentId }),
    });
    if (notification) notifications.push(notification);
  }
  await scope.mentions.write({ authorId: input.authorId, target: input.target, users });
  return notifications;
}

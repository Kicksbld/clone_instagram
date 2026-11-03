import { NotFoundError } from '../../../shared/domain/errors.ts';
import { canMessage } from '../../../shared/domain/visibility.ts';
import type { RelationshipReader } from '../../../shared/application/relationship-reader.ts';
import type { MessagingRepository } from './ports/messaging-repository.ts';

export async function requireRecipient(
  repository: MessagingRepository,
  relationships: RelationshipReader,
  viewerId: string,
  userId: string,
) {
  const [viewer, recipient, relation] = await Promise.all([
    repository.account(viewerId),
    repository.account(userId),
    relationships.between(viewerId, userId),
  ]);
  if (
    !viewer ||
    viewer.status !== 'active' ||
    !recipient ||
    !canMessage(viewerId, recipient, relation)
  ) {
    throw new NotFoundError('conversation_not_found', 'Conversation introuvable.');
  }
}
export async function requireConversation(
  repository: MessagingRepository,
  relationships: RelationshipReader,
  viewerId: string,
  id: string,
) {
  const conversation = await repository.findConversation(id);
  if (
    !conversation ||
    (conversation.memberLowId !== viewerId && conversation.memberHighId !== viewerId)
  ) {
    throw new NotFoundError('conversation_not_found', 'Conversation introuvable.');
  }
  const otherId =
    conversation.memberLowId === viewerId ? conversation.memberHighId : conversation.memberLowId;
  await requireRecipient(repository, relationships, viewerId, otherId);
  return conversation;
}

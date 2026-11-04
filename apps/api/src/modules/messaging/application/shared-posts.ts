import type { RelationshipReader } from '../../../shared/application/relationship-reader.ts';
import { canViewContent, SELF_RELATIONSHIP } from '../../../shared/domain/visibility.ts';
import type { Message } from '../domain/conversation.ts';
import type { SharedPostReader } from './ports/shared-post-reader.ts';

/** Resolve every reference for the current reader, including inbox and realtime previews. */
export class SharedPosts {
  constructor(
    private readonly reader: SharedPostReader,
    private readonly relationships: RelationshipReader,
  ) {}
  async read(id: string, viewerId: string) {
    const post = await this.reader.find(id);
    if (!post) return null;
    const relation =
      post.owner.id === viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(viewerId, post.owner.id);
    return canViewContent(viewerId, post.owner, relation) ? post.preview : null;
  }
  async resolve(message: Message, viewerId: string): Promise<Message> {
    if (message.kind !== 'post_share') return message;
    return {
      ...message,
      sharedPost: message.sharedPostId ? await this.read(message.sharedPostId, viewerId) : null,
    };
  }
}

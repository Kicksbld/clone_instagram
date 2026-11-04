import type { SharedStoryReader } from './ports/shared-story-reader.ts';
import type { Clock } from '../../../shared/application/clock.ts';
import type { RelationshipReader } from '../../../shared/application/relationship-reader.ts';
import {
  canViewContent,
  canViewStory,
  SELF_RELATIONSHIP,
} from '../../../shared/domain/visibility.ts';
import type { Message } from '../domain/conversation.ts';
import type { SharedPostReader } from './ports/shared-post-reader.ts';

/** Resolve every reference for the current reader, including inbox and realtime previews. */
export class MessageReferences {
  constructor(
    private readonly reader: SharedPostReader,
    private readonly relationships: RelationshipReader,
    private readonly stories: SharedStoryReader,
    private readonly clock: Clock,
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
  async readStory(id: string, viewerId: string) {
    const story = await this.stories.find(id);
    if (!story || Date.parse(story.preview.expiresAt) <= this.clock.now().getTime()) return null;
    const relation =
      story.owner.id === viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(viewerId, story.owner.id);
    return canViewStory(viewerId, { author: story.owner, audience: story.audience }, relation)
      ? story.preview
      : null;
  }
  async resolve(message: Message, viewerId: string): Promise<Message> {
    if (message.kind === 'story_reply')
      return {
        ...message,
        sharedStory: message.storyId ? await this.readStory(message.storyId, viewerId) : null,
      };
    if (message.kind !== 'post_share') return message;
    return {
      ...message,
      sharedPost: message.sharedPostId ? await this.read(message.sharedPostId, viewerId) : null,
    };
  }
}

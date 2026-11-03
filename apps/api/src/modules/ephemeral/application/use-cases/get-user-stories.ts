import type { Clock } from '../../../../shared/application/clock.ts';
import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import {
  canViewContent,
  canViewStory,
  SELF_RELATIONSHIP,
} from '../../../../shared/domain/visibility.ts';
import { UserNotFoundError } from '../../../identity/domain/errors.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import type { Story } from '../../domain/story.ts';
import type { StoryReader } from '../ports/story-repository.ts';

/**
 * Stories actives d'un compte que l'appelant peut voir (`canViewStory`, ADR-006), de la plus ancienne
 * à la plus récente. Auteur dont l'appelant ne peut pas voir les contenus : `user_not_found`.
 */
export class GetUserStories {
  constructor(
    private readonly accounts: AccountReader,
    private readonly relationships: RelationshipReader,
    private readonly stories: StoryReader,
    private readonly clock: Clock,
  ) {}

  async execute(input: { viewerId: string; userId: string }): Promise<Story[]> {
    const author = await this.accounts.findById(input.userId);
    if (!author) throw new UserNotFoundError();
    const relation =
      author.id === input.viewerId
        ? SELF_RELATIONSHIP
        : await this.relationships.between(input.viewerId, author.id);
    if (!canViewContent(input.viewerId, author, relation)) throw new UserNotFoundError();

    const stories = await this.stories.listActiveByAuthor(
      author.id,
      input.viewerId,
      this.clock.now(),
    );
    return stories.filter((story) =>
      canViewStory(input.viewerId, { author, audience: story.audience }, relation),
    );
  }
}

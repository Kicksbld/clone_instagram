import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { AccountReader } from '../../../social/application/ports/account-reader.ts';
import { requireVisibleContent } from '../../../social/application/require-visible-content.ts';
import { type Post, USER_POSTS_PAGE_SIZE } from '../../domain/post.ts';
import type { PostReader } from '../ports/post-repository.ts';

/**
 * Posts d'un compte (grille du profil), du plus récent au plus ancien. Réservé à qui peut voir ses
 * contenus (ADR-006) ; sinon `user_not_found`.
 */
export class ListUserPosts {
  constructor(
    private readonly accounts: AccountReader,
    private readonly relationships: RelationshipReader,
    private readonly posts: PostReader,
  ) {}

  async execute(input: {
    viewerId: string;
    userId: string;
    after: PageCursor | null;
  }): Promise<Page<Post>> {
    await requireVisibleContent(this.accounts, this.relationships, input.viewerId, input.userId);
    return this.posts.listByAuthor({
      authorId: input.userId,
      after: input.after,
      limit: USER_POSTS_PAGE_SIZE,
    });
  }
}

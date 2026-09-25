import type { RelationshipReader } from '../../../../shared/application/relationship-reader.ts';
import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { UserSummary } from '../../domain/user-summary.ts';
import type { AccountReader } from '../ports/account-reader.ts';
import type { SocialGraphReader } from '../ports/social-graph-reader.ts';
import { requireVisibleContent } from '../require-visible-content.ts';
import { FOLLOW_LIST_PAGE_SIZE } from './list-followers.ts';

/** Abonnements d'un compte, abonnement le plus récent en premier, filtrés par la politique de visibilité. */
export class ListFollowing {
  constructor(
    private readonly accounts: AccountReader,
    private readonly relationships: RelationshipReader,
    private readonly graph: SocialGraphReader,
  ) {}

  async execute(input: {
    viewerId: string;
    userId: string;
    after: PageCursor | null;
  }): Promise<Page<UserSummary>> {
    await requireVisibleContent(this.accounts, this.relationships, input.viewerId, input.userId);
    return this.graph.listFollowing({
      ownerId: input.userId,
      viewerId: input.viewerId,
      after: input.after,
      limit: FOLLOW_LIST_PAGE_SIZE,
    });
  }
}

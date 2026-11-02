import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { UserSummary } from '../../domain/user-summary.ts';
import type { SocialGraphReader } from '../ports/social-graph-reader.ts';
import { FOLLOW_LIST_PAGE_SIZE } from './list-followers.ts';

/**
 * Demandes d'abonnement que j'ai reçues, la plus récente en premier, par pages de 20 ; comptes actifs
 * et sans blocage seulement (ADR-006).
 */
export class ListFollowRequests {
  constructor(private readonly graph: SocialGraphReader) {}

  execute(input: { viewerId: string; after: PageCursor | null }): Promise<Page<UserSummary>> {
    return this.graph.listFollowRequests({
      viewerId: input.viewerId,
      after: input.after,
      limit: FOLLOW_LIST_PAGE_SIZE,
    });
  }
}

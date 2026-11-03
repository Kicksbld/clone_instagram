import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { UserSummary } from '../../domain/user-summary.ts';
import type { SocialGraphReader } from '../ports/social-graph-reader.ts';
import { FOLLOW_LIST_PAGE_SIZE } from './list-followers.ts';

/**
 * Mes amis proches, ajout le plus récent en premier, par pages de 20 ; comptes visibles seulement
 * (actifs, sans blocage dans un sens ou dans l'autre, ADR-006). Liste privée : seul son propriétaire
 * la lit.
 */
export class ListCloseFriends {
  constructor(private readonly graph: SocialGraphReader) {}

  execute(input: { viewerId: string; after: PageCursor | null }): Promise<Page<UserSummary>> {
    return this.graph.listCloseFriends({
      viewerId: input.viewerId,
      after: input.after,
      limit: FOLLOW_LIST_PAGE_SIZE,
    });
  }
}

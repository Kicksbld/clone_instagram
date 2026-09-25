import { normalizeSearchQuery } from '../../domain/search-query.ts';
import type { UserSummary } from '../../domain/user-summary.ts';
import type { SocialGraphReader } from '../ports/social-graph-reader.ts';

export const SEARCH_RESULTS_LIMIT = 30;

/**
 * Recherche par username ou nom (ADR-006) : comptes bloqués dans un sens ou dans l'autre et comptes
 * non actifs absents ; comptes privés présents (leur profil reste visible).
 */
export class SearchUsers {
  constructor(private readonly graph: SocialGraphReader) {}

  async execute(input: { viewerId: string; query: string }): Promise<UserSummary[]> {
    const query = normalizeSearchQuery(input.query);
    if (query === null) return [];
    return this.graph.search({ viewerId: input.viewerId, query, limit: SEARCH_RESULTS_LIMIT });
  }
}

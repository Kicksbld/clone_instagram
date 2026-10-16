import { z } from 'zod';

export const ACCOUNT_STATUSES = ['active', 'suspended', 'banned'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Recherche dans l'URL (`?q=&status=&cursor=`, ADR-011) ; une valeur invalide est ignorée. */
export interface UserSearch {
  q?: string;
  status?: AccountStatus;
  cursor?: string;
}

const text = (max: number) => z.string().trim().min(1).max(max).optional().catch(undefined);

const searchSchema = z.object({
  q: text(64),
  status: z.enum(ACCOUNT_STATUSES).optional().catch(undefined),
  cursor: text(128),
});

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseUserSearch(params: RawSearchParams): UserSearch {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const parsed = searchSchema.parse({
    q: first(params['q']),
    status: first(params['status']),
    cursor: first(params['cursor']),
  });
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
}

/** URL de la liste avec ces critères (liens de pagination, filtres). */
export function usersHref(search: UserSearch): string {
  const params = new URLSearchParams();
  if (search.q) params.set('q', search.q);
  if (search.status) params.set('status', search.status);
  if (search.cursor) params.set('cursor', search.cursor);
  const query = params.toString();
  return query ? `/users?${query}` : '/users';
}

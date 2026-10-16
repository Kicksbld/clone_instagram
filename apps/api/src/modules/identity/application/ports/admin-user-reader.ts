import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { ModeratedStatus } from '../../domain/account-moderation.ts';
import type { Profile } from '../../domain/profile.ts';

export interface AdminUserQuery {
  /** Correspondance partielle sur le username ou le nom (déjà normalisée) ; `null` = tous. */
  search: string | null;
  status: ModeratedStatus | null;
  after: PageCursor | null;
  limit: number;
}

/** Comptes vus par un admin (backoffice) : tous statuts sauf `deleted`, du plus récent au plus ancien. */
export interface AdminUserReader {
  list(query: AdminUserQuery): Promise<Page<Profile>>;
}

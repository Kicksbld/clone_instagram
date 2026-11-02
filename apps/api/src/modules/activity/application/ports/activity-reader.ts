import type { Page, PageCursor } from '../../../../shared/domain/pagination.ts';
import type { ActivityGroup } from '../../domain/activity.ts';

export interface ActivityQuery {
  recipientId: string;
  /** Curseur `(date la plus récente, clé du groupe)` du dernier groupe renvoyé. */
  after: PageCursor | null;
  limit: number;
}

/**
 * Lecture de l'Activité (table `notifications`), politique de visibilité traduite en SQL (ADR-006) :
 * acteurs bloqués dans un sens ou dans l'autre ou non actifs, posts et commentaires supprimés ou
 * invisibles pour le destinataire masqués.
 */
export interface ActivityReader {
  /** Groupes du plus récent au plus ancien. */
  list(query: ActivityQuery): Promise<Page<ActivityGroup>>;
  /** Groupes visibles contenant au moins une notification non lue. */
  countUnread(recipientId: string): Promise<number>;
}

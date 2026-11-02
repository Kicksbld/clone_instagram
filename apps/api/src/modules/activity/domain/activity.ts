import type { ImageVariantPaths } from '../../../shared/domain/image-variants.ts';
import type { NotificationType } from '../../../shared/domain/notification.ts';
import type { Page } from '../../../shared/domain/pagination.ts';

/** Groupes de l'Activité par page (ADR-026). */
export const ACTIVITY_PAGE_SIZE = 20;

/**
 * Groupe de notifications, regroupées à la lecture par `group_key` (ADR-026) : dernier acteur,
 * nombre d'acteurs et date la plus récente. `post` et `comment` : cible, selon le type.
 */
export interface ActivityGroup {
  key: string;
  type: NotificationType;
  actor: { id: string; username: string; avatar: ImageVariantPaths | null };
  actorCount: number;
  latestAt: Date;
  /** Aucune notification non lue dans le groupe. */
  read: boolean;
  post: { id: string; thumbnail: ImageVariantPaths } | null;
  comment: { id: string; body: string } | null;
}

/** Une page de l'Activité et le nombre de groupes non lus (pastille). */
export interface Activity {
  page: Page<ActivityGroup>;
  unreadCount: number;
}

const GROUP_KEY = /^[a-z_]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Clé de groupe bien formée (`<type>:<uuid>`), second membre du curseur de l'Activité. */
export function isGroupKey(value: string): boolean {
  return GROUP_KEY.test(value);
}

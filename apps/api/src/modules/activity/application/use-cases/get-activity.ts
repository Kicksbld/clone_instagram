import type { PageCursor } from '../../../../shared/domain/pagination.ts';
import { type Activity, ACTIVITY_PAGE_SIZE } from '../../domain/activity.ts';
import type { ActivityReader } from '../ports/activity-reader.ts';

/**
 * Activité de l'appelant, regroupée à la lecture (ADR-026), et nombre de groupes non lus. La
 * visibilité est appliquée par la requête (ADR-006) ; sans profil, l'Activité est vide.
 */
export class GetActivity {
  constructor(private readonly activity: ActivityReader) {}

  async execute(input: { viewerId: string; after: PageCursor | null }): Promise<Activity> {
    const [page, unreadCount] = await Promise.all([
      this.activity.list({
        recipientId: input.viewerId,
        after: input.after,
        limit: ACTIVITY_PAGE_SIZE,
      }),
      this.activity.countUnread(input.viewerId),
    ]);
    return { page, unreadCount };
  }
}

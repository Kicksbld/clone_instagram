import { blocks, newId, notifications, type Executor } from '@clone/db';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';

import type { NotificationWriter } from '../../../../shared/application/notification-writer.ts';
import {
  type CreatedNotification,
  groupKeyOf,
  type NotificationDraft,
  shouldNotify,
} from '../../../../shared/domain/notification.ts';

/**
 * Notifications écrites dans la transaction de l'action (ADR-026) : insertion conditionnelle (aucun
 * blocage dans un sens ou dans l'autre), sans effet si elle existe déjà (unicité `NULLS NOT DISTINCT`).
 */
export class DrizzleNotificationWriter implements NotificationWriter {
  constructor(private readonly db: Executor) {}

  async notify(draft: NotificationDraft): Promise<CreatedNotification | null> {
    if (!shouldNotify(draft.actorId, draft.recipientId)) return null;

    const id = newId();
    const { postId, commentId } = targetOf(draft);
    const rows = await this.db.execute<{ id: string }>(sql`
      INSERT INTO ${notifications}
        (id, recipient_id, actor_id, type, post_id, comment_id, group_key)
      SELECT ${id}, ${draft.recipientId}, ${draft.actorId}, ${draft.type}, ${postId}, ${commentId},
        ${groupKeyOf(id, draft)}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${blocks} AS b
        WHERE (b.blocker_id = ${draft.recipientId} AND b.blocked_id = ${draft.actorId})
           OR (b.blocker_id = ${draft.actorId} AND b.blocked_id = ${draft.recipientId})
      )
      ON CONFLICT ON CONSTRAINT notifications_unique DO NOTHING
      RETURNING id
    `);
    return rows.length > 0 ? { ...draft, id } : null;
  }

  async retract(draft: NotificationDraft): Promise<void> {
    const { postId, commentId } = targetOf(draft);
    await this.db
      .delete(notifications)
      .where(
        and(
          eq(notifications.recipientId, draft.recipientId),
          eq(notifications.actorId, draft.actorId),
          eq(notifications.type, draft.type),
          equalOrNull(notifications.postId, postId),
          equalOrNull(notifications.commentId, commentId),
          isNull(notifications.storyId),
        ),
      );
  }
}

/** Colonnes cibles de la notification, `null` quand le type n'en a pas. */
function targetOf(draft: NotificationDraft): { postId: string | null; commentId: string | null } {
  return {
    postId: 'postId' in draft ? draft.postId : null,
    commentId: 'commentId' in draft ? draft.commentId : null,
  };
}

function equalOrNull(
  column: typeof notifications.postId | typeof notifications.commentId,
  value: string | null,
): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

import { notifications, type Executor } from '@clone/db';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';

import type { ImageVariantPaths } from '../../../../shared/domain/image-variants.ts';
import type { NotificationType } from '../../../../shared/domain/notification.ts';
import type { Page } from '../../../../shared/domain/pagination.ts';
import type { ActivityQuery, ActivityReader } from '../../application/ports/activity-reader.ts';
import type { ActivityRepository } from '../../application/ports/activity-repository.ts';
import type { ActivityGroup } from '../../domain/activity.ts';

interface GroupRow extends Record<string, unknown> {
  group_key: string;
  type: NotificationType;
  actor_id: string;
  username: string;
  avatar: ImageVariantPaths | null;
  actor_count: number;
  latest_ms: number;
  unread: boolean;
  post_id: string | null;
  thumbnail: ImageVariantPaths | null;
  comment_id: string | null;
  body: string | null;
}

/**
 * Notifications visibles par leur destinataire (ADR-006, ADR-026) : acteur actif sans blocage dans
 * un sens ou dans l'autre ; post non supprimé et visible (`canViewContent`) ; commentaire non supprimé.
 */
function visibleNotifications(recipientId: string): SQL {
  const notBlockedWith = (accountId: SQL) => sql`NOT EXISTS (
    SELECT 1 FROM blocks AS b
    WHERE (b.blocker_id = ${recipientId} AND b.blocked_id = ${accountId})
       OR (b.blocker_id = ${accountId} AND b.blocked_id = ${recipientId})
  )`;
  return sql`
    SELECT n.id, n.actor_id, n.type, n.post_id, n.comment_id, n.group_key, n.created_at, n.read_at
    FROM ${notifications} AS n
    JOIN profiles AS actor ON actor.id = n.actor_id
    LEFT JOIN posts AS p ON p.id = n.post_id
    LEFT JOIN profiles AS owner ON owner.id = p.author_id
    LEFT JOIN comments AS c ON c.id = n.comment_id
    WHERE n.recipient_id = ${recipientId}
      AND actor.status = 'active'
      AND ${notBlockedWith(sql`n.actor_id`)}
      AND (n.post_id IS NULL OR (p.deleted_at IS NULL AND (owner.id = ${recipientId} OR (
        owner.status = 'active'
        AND ${notBlockedWith(sql`owner.id`)}
        AND (NOT owner.is_private OR EXISTS (
          SELECT 1 FROM follows AS f WHERE f.follower_id = ${recipientId} AND f.followee_id = owner.id
        ))
      ))))
      AND (n.comment_id IS NULL OR c.deleted_at IS NULL)
  `;
}

/**
 * Regroupement calculé à la lecture (ADR-026) : un groupe par `group_key`, représenté par sa
 * notification la plus récente, avec le nombre d'acteurs et l'état de lecture du groupe.
 */
export class DrizzleActivityReader implements ActivityReader {
  constructor(private readonly db: Executor) {}

  async list({ recipientId, after, limit }: ActivityQuery): Promise<Page<ActivityGroup>> {
    const rows = await this.db.execute<GroupRow>(sql`
      WITH visible AS (${visibleNotifications(recipientId)}),
      groups AS (
        SELECT DISTINCT ON (v.group_key) v.group_key, v.type, v.actor_id, v.post_id, v.comment_id,
          v.created_at,
          count(*) OVER w AS actor_count,
          bool_or(v.read_at IS NULL) OVER w AS unread
        FROM visible AS v
        WINDOW w AS (PARTITION BY v.group_key)
        ORDER BY v.group_key, v.created_at DESC, v.id DESC
      )
      SELECT g.group_key, g.type, g.actor_id, actor.username, avatar.variants AS avatar,
        g.actor_count::int AS actor_count,
        (extract(epoch FROM g.created_at) * 1000)::float8 AS latest_ms,
        g.unread, g.post_id, thumbnail.variants AS thumbnail, g.comment_id, c.body
      FROM groups AS g
      JOIN profiles AS actor ON actor.id = g.actor_id
      LEFT JOIN media AS avatar ON avatar.id = actor.avatar_media_id
      LEFT JOIN LATERAL (
        SELECT m.variants FROM post_media AS pm JOIN media AS m ON m.id = pm.media_id
        WHERE pm.post_id = g.post_id ORDER BY pm.position LIMIT 1
      ) AS thumbnail ON true
      LEFT JOIN comments AS c ON c.id = g.comment_id
      ${
        after
          ? sql`WHERE (g.created_at, g.group_key) < (${after.createdAt.toISOString()}::timestamptz, ${after.id})`
          : sql``
      }
      ORDER BY g.created_at DESC, g.group_key DESC
      -- Une ligne de plus pour savoir s'il existe une page suivante.
      LIMIT ${limit + 1}
    `);

    const page = [...rows].slice(0, limit).map(toGroup);
    const last = page.at(-1);
    return {
      items: page,
      next: rows.length > limit && last ? { createdAt: last.latestAt, id: last.key } : null,
    };
  }

  async countUnread(recipientId: string): Promise<number> {
    const [row] = await this.db.execute<{ count: number }>(sql`
      WITH visible AS (${visibleNotifications(recipientId)})
      SELECT count(DISTINCT group_key)::int AS count FROM visible WHERE read_at IS NULL
    `);
    return row?.count ?? 0;
  }
}

/** État de lecture : une seule requête, sans effet sur les notifications déjà lues. */
export class DrizzleActivityRepository implements ActivityRepository {
  constructor(private readonly db: Executor) {}

  async markAllRead(recipientId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
  }
}

function toGroup(row: GroupRow): ActivityGroup {
  if (row.post_id && !row.thumbnail) {
    // Un post non supprimé a toujours au moins un média `ready`.
    throw new Error(`Post sans miniature dans l'Activité (post ${row.post_id})`);
  }
  return {
    key: row.group_key,
    type: row.type,
    actor: { id: row.actor_id, username: row.username, avatar: row.avatar },
    actorCount: row.actor_count,
    latestAt: new Date(Math.round(row.latest_ms)),
    read: !row.unread,
    post: row.post_id && row.thumbnail ? { id: row.post_id, thumbnail: row.thumbnail } : null,
    comment: row.comment_id && row.body !== null ? { id: row.comment_id, body: row.body } : null,
  };
}

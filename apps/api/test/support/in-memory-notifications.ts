import type {
  ActivityQuery,
  ActivityReader,
} from '../../src/modules/activity/application/ports/activity-reader.ts';
import type { ActivityRepository } from '../../src/modules/activity/application/ports/activity-repository.ts';
import type { ActivityGroup } from '../../src/modules/activity/domain/activity.ts';
import type { NotificationDispatcher } from '../../src/shared/application/notification-dispatcher.ts';
import type { NotificationWriter } from '../../src/shared/application/notification-writer.ts';
import {
  type CreatedNotification,
  groupKeyOf,
  type NotificationDraft,
  shouldNotify,
} from '../../src/shared/domain/notification.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import type { InMemoryComments } from './in-memory-comments.ts';
import type { InMemoryMediaRepository } from './in-memory-media-repository.ts';
import type { InMemoryPosts } from './in-memory-posts.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import type { InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';

/** Notification enregistrée, comme une ligne de la table `notifications`. */
export type NotificationEntry = CreatedNotification & {
  groupKey: string;
  createdAt: Date;
  readAt: Date | null;
};

/**
 * Adapter en mémoire (ADR-005) : mêmes règles que `DrizzleNotificationWriter` (ni soi-même, ni
 * blocage dans un sens ou dans l'autre, unicité par acteur, type et cible).
 */
export class InMemoryNotifications implements NotificationWriter {
  readonly rows = new Map<string, NotificationEntry>();
  /** Notifications telles que les use cases les ont demandées, même clé que `rows`. */
  private readonly drafts = new Map<string, NotificationDraft>();
  private next = 0;
  private clock = Date.parse('2026-09-25T12:00:00.000Z');

  constructor(private readonly relationships: InMemoryRelationshipReader) {}

  notify(draft: NotificationDraft): Promise<CreatedNotification | null> {
    if (
      !shouldNotify(draft.actorId, draft.recipientId) ||
      this.relationships.isBlockedEitherWay(draft.actorId, draft.recipientId) ||
      this.rows.has(keyOf(draft))
    ) {
      return Promise.resolve(null);
    }
    const id = `0199a1b2-0000-7000-d000-${String(++this.next).padStart(12, '0')}`;
    // Une milliseconde de plus à chaque notification : ordre d'insertion = ordre chronologique.
    this.clock += 1;
    const created: CreatedNotification = { ...draft, id };
    this.drafts.set(keyOf(draft), draft);
    this.rows.set(keyOf(draft), {
      ...created,
      groupKey: groupKeyOf(id, draft),
      createdAt: new Date(this.clock),
      readAt: null,
    });
    return Promise.resolve(created);
  }

  retract(draft: NotificationDraft): Promise<void> {
    this.rows.delete(keyOf(draft));
    this.drafts.delete(keyOf(draft));
    return Promise.resolve();
  }

  /** Notifications reçues par `recipientId`, sans leurs métadonnées. */
  receivedBy(recipientId: string): NotificationDraft[] {
    return [...this.drafts.values()].filter((draft) => draft.recipientId === recipientId);
  }
}

/** Clé d'unicité de la table : destinataire, acteur, type et cible. */
function keyOf(draft: NotificationDraft): string {
  return [
    draft.recipientId,
    draft.actorId,
    draft.type,
    'postId' in draft ? draft.postId : '',
    'commentId' in draft ? draft.commentId : '',
  ].join('|');
}

/** Dispatcher en mémoire : enregistre les notifications diffusées après la transaction. */
export class InMemoryNotificationDispatcher implements NotificationDispatcher {
  readonly dispatched: CreatedNotification[] = [];

  dispatch(notifications: CreatedNotification[]): void {
    this.dispatched.push(...notifications);
  }
}

/**
 * Lecture de l'Activité en mémoire : même regroupement que `DrizzleActivityReader` ; visibilité
 * limitée aux acteurs (actifs, sans blocage) et aux posts et commentaires supprimés.
 */
export class InMemoryActivity implements ActivityReader, ActivityRepository {
  constructor(
    private readonly notifications: InMemoryNotifications,
    private readonly profiles: InMemoryProfileRepository,
    private readonly media: InMemoryMediaRepository,
    private readonly posts: InMemoryPosts,
    private readonly comments: InMemoryComments,
    private readonly relationships: InMemoryRelationshipReader,
  ) {}

  list({ recipientId, after, limit }: ActivityQuery): Promise<Page<ActivityGroup>> {
    const groups = this.groups(recipientId).filter(
      (group) =>
        !after ||
        group.latestAt < after.createdAt ||
        (group.latestAt.getTime() === after.createdAt.getTime() && group.key < after.id),
    );
    const items = groups.slice(0, limit);
    const last = items.at(-1);
    return Promise.resolve({
      items,
      next: groups.length > limit && last ? { createdAt: last.latestAt, id: last.key } : null,
    });
  }

  countUnread(recipientId: string): Promise<number> {
    return Promise.resolve(this.groups(recipientId).filter((group) => !group.read).length);
  }

  markAllRead(recipientId: string): Promise<void> {
    for (const [key, row] of this.notifications.rows) {
      if (row.recipientId === recipientId && !row.readAt) {
        this.notifications.rows.set(key, { ...row, readAt: new Date() });
      }
    }
    return Promise.resolve();
  }

  /** Groupes visibles, du plus récent au plus ancien. */
  private groups(recipientId: string): ActivityGroup[] {
    const byKey = new Map<string, NotificationEntry[]>();
    for (const row of this.notifications.rows.values()) {
      if (row.recipientId !== recipientId || !this.isVisible(row)) continue;
      byKey.set(row.groupKey, [...(byKey.get(row.groupKey) ?? []), row]);
    }
    return [...byKey.values()]
      .map((rows) => {
        const sorted = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return this.toGroup(sorted);
      })
      .sort(
        (a, b) =>
          b.latestAt.getTime() - a.latestAt.getTime() ||
          (a.key < b.key ? 1 : a.key > b.key ? -1 : 0),
      );
  }

  private isVisible(row: NotificationEntry): boolean {
    const actor = this.profiles.rows.get(row.actorId);
    if (actor?.status !== 'active') return false;
    if (this.relationships.isBlockedEitherWay(row.actorId, row.recipientId)) return false;
    if ('postId' in row && this.posts.rows.get(row.postId)?.deletedAt !== null) return false;
    if ('commentId' in row && this.comments.rows.get(row.commentId)?.deletedAt !== null)
      return false;
    return true;
  }

  private toGroup(rows: NotificationEntry[]): ActivityGroup {
    const [latest] = rows;
    if (!latest) throw new Error('Groupe vide');
    const actor = this.profiles.rows.get(latest.actorId);
    if (!actor) throw new Error(`Acteur absent : ${latest.actorId}`);
    const post = 'postId' in latest ? this.posts.rows.get(latest.postId) : undefined;
    const thumbnail = post?.mediaIds[0] ? this.media.rows.get(post.mediaIds[0])?.variants : null;
    const comment = 'commentId' in latest ? this.comments.rows.get(latest.commentId) : undefined;
    return {
      key: latest.groupKey,
      type: latest.type,
      actor: { id: actor.id, username: actor.username, avatar: actor.avatar?.variants ?? null },
      actorCount: rows.length,
      latestAt: latest.createdAt,
      read: rows.every((row) => row.readAt !== null),
      post: post && thumbnail ? { id: post.id, thumbnail } : null,
      comment: comment ? { id: comment.id, body: comment.body } : null,
    };
  }
}

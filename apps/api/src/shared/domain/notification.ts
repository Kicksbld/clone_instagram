/**
 * Notifications in-app (ADR-026) : écrites par les use cases de plusieurs modules par le port
 * transverse `NotificationWriter`, dans la transaction de l'action.
 */

/** Types de la tranche T18 ; chaque tranche suivante ajoute les siens. */
export type NotificationType = 'like' | 'comment' | 'comment_reply' | 'follow';

/** Cible d'une notification : colonnes nullables selon le type (ADR-007). */
export type NotificationTarget =
  | { type: 'like'; postId: string }
  | { type: 'comment' | 'comment_reply'; postId: string; commentId: string }
  | { type: 'follow' };

/** Notification à écrire (ou à retirer) : destinataire, acteur et cible. */
export type NotificationDraft = NotificationTarget & { recipientId: string; actorId: string };

/** Notification créée, transmise au `NotificationDispatcher` après la transaction. */
export type CreatedNotification = NotificationDraft & { id: string };

/** Jamais de notification vers soi-même. Le blocage est vérifié par l'adapter, dans la transaction. */
export function shouldNotify(actorId: string, recipientId: string): boolean {
  return actorId !== recipientId;
}

/**
 * Clé de regroupement calculée à l'insertion : les J'aime d'un même post forment un groupe
 * (`like:<postId>`) ; les autres types ne se regroupent pas (`<type>:<id de la notification>`).
 */
export function groupKeyOf(id: string, target: NotificationTarget): string {
  return target.type === 'like' ? `like:${target.postId}` : `${target.type}:${id}`;
}

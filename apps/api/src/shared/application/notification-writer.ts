import type { CreatedNotification, NotificationDraft } from '../domain/notification.ts';

/**
 * Notifications in-app (table `notifications`, ADR-026), écrites dans la transaction de l'action
 * (`UnitOfWork`) : une notification existe si et seulement si l'action existe.
 */
export interface NotificationWriter {
  /**
   * Crée la notification ; `null`, sans effet, vers soi-même (`shouldNotify`), si un blocage existe
   * dans un sens ou dans l'autre entre l'acteur et le destinataire, ou si elle existe déjà.
   */
  notify(draft: NotificationDraft): Promise<CreatedNotification | null>;
  /** Supprime la notification correspondante (action annulée) ; sans effet si elle n'existe pas. */
  retract(draft: NotificationDraft): Promise<void>;
}

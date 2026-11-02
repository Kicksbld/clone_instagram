import type { CreatedNotification } from '../domain/notification.ts';

/**
 * Diffusion des notifications créées (ADR-026), appelée **après** la validation de la transaction :
 * `activity.created` par le WebSocket (T19), puis push (P2). Jamais bloquant, comme
 * `AnalyticsTracker` : `dispatch` ne lève pas d'erreur, un échec est journalisé par l'adapter.
 */
export interface NotificationDispatcher {
  dispatch(notifications: CreatedNotification[]): void;
}

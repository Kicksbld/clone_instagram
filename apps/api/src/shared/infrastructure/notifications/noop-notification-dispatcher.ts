import type { NotificationDispatcher } from '../../application/notification-dispatcher.ts';

/**
 * Dispatcher de T18 : rien n'est encore diffusé. `activity.created` arrive avec le WebSocket (T19,
 * ADR-021), le push en P2 (ADR-027) ; l'app recharge la pastille par REST.
 */
export const noopNotificationDispatcher: NotificationDispatcher = { dispatch: () => undefined };

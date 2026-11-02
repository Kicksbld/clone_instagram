import type { NotificationDispatcher } from '../../application/notification-dispatcher.ts';

/** Adapter silencieux pour les tests de persistance qui ne démarrent pas de transport temps réel. */
export const noopNotificationDispatcher: NotificationDispatcher = { dispatch: () => undefined };

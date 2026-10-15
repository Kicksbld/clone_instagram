/**
 * Faits métier confirmés envoyés à PostHog (ADR-013). Liste fermée, propriétés typées : aucune donnée
 * personnelle possible (ni email, ni nom, ni username, ni contenu).
 */
export type AnalyticsEvent =
  | { name: 'profile_created' }
  | { name: 'post_created'; properties: { kind: 'post' | 'reel'; media_count: number } }
  | { name: 'subscription_activated'; properties: { product_id: string } };

/**
 * Analytics côté serveur (ADR-013) : appelé après la validation de la transaction. Jamais bloquant :
 * `track` ne lève pas d'erreur, un échec d'envoi est journalisé par l'adapter.
 */
export interface AnalyticsTracker {
  /** `distinctId` = identifiant de profil. */
  track(distinctId: string, event: AnalyticsEvent): void;
}

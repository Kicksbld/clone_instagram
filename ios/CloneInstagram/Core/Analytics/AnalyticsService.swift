import Foundation

/**
 Analytics de l'app (ADR-013), seul accès à PostHog : remplaçable par un faux dans les tests et les previews.
 Jamais bloquant : aucune méthode ne lève d'erreur, un échec d'envoi est ignoré.
 */
protocol AnalyticsService {
    func track(_ event: AnalyticsEvent)
    /// `distinct_id` = identifiant de profil, dès la création du profil (avant le paywall).
    func identify(profileId: String)
    /// Déconnexion : les événements suivants ne sont plus rattachés au profil.
    func reset()
    /// Variante du paywall pour l'utilisateur courant ; `control` si PostHog est injoignable.
    func paywallVariant() async -> PaywallVariant
}

/// Utilisé quand la clé PostHog est absente : aucun envoi, paywall `control`.
struct NoopAnalyticsService: AnalyticsService {
    func track(_: AnalyticsEvent) {}

    func identify(profileId _: String) {}

    func reset() {}

    func paywallVariant() async -> PaywallVariant {
        .control
    }
}

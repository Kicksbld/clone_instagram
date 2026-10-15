import Foundation

/// Variante de présentation du paywall, lue sur le feature flag d'expérience PostHog (ADR-013).
enum PaywallVariant: String, Sendable {
    /// Paywall de référence ; aussi la variante par défaut si PostHog est injoignable.
    case control
    /// Accroche centrée sur l'icône d'app personnalisée, bouton « Essayer Clone Plus ».
    case test

    /// Clé du feature flag de l'expérience dans PostHog.
    static let flagKey = "paywall-presentation"

    /// Valeur du flag ; inconnue ou absente → `control`.
    init(flagValue: Any?) {
        self = (flagValue as? String).flatMap(Self.init(rawValue:)) ?? .control
    }
}

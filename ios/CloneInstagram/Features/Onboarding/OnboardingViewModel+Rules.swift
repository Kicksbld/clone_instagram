import Foundation

/// Règles des champs de l'onboarding (mêmes limites que le contrat, ADR-018) et état du username.
extension OnboardingViewModel {
    enum UsernameStatus: Equatable {
        case idle
        /// Format refusé localement (même règle que le contrat).
        case invalid
        case checking
        case available
        case taken(suggestions: [String])
        /// Vérification impossible (réseau) : on peut réessayer en modifiant le champ.
        case failed
    }

    static let minimumAge = 13
    static let minimumPasswordLength = 6
    static let fullNameMaxLength = 30
    static let bioMaxLength = 150
    /// Délai de Supabase entre deux envois de code.
    static let resendDelay: TimeInterval = 60
    static let usernameCheckDelay: Duration = .milliseconds(400)
}

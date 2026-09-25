/// Étapes de l'onboarding, dans l'ordre du parcours d'Instagram (fiche T2, ADR-018).
enum OnboardingStep: Hashable {
    case createAccount
    case email
    case confirmationCode
    case password
    case birthDate
    case fullName
    case username
    /// « J'accepte » crée le profil.
    case terms
    case profilePhoto
    case bio
    case completed
}

/// Point d'entrée de l'onboarding.
enum OnboardingEntry: Hashable {
    /// Depuis l'écran de bienvenue : « Commencer ».
    case newAccount
    /// Session ouverte sans profil : reprise après un abandon (ADR-018).
    case resume(AuthProvider)

    var firstStep: OnboardingStep {
        switch self {
        case .newAccount: .createAccount
        case .resume(.email): .password
        case .resume(.apple): .birthDate
        }
    }
}

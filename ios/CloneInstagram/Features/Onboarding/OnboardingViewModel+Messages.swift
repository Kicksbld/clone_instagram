/// Messages d'erreur compréhensibles, sans détail technique (ADR-014).
extension OnboardingViewModel {
    static func message(for error: AuthServiceError) -> String {
        switch error {
        case .invalidCode: "Ce code n'est pas valide ou a expiré. Vérifiez-le ou demandez-en un nouveau."
        case .tooManyRequests: "Trop de tentatives. Patientez un peu avant de réessayer."
        case .weakPassword: "Ce mot de passe est trop faible. Choisissez-en un autre."
        case .invalidEmail: "Saisissez une adresse e-mail valide."
        case .invalidCredentials: "Adresse e-mail ou mot de passe incorrect."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unknown: "Une erreur est survenue. Réessayez."
        }
    }

    static func message(for error: IdentityServiceError) -> String {
        switch error {
        case .usernameTaken: "Ce nom d'utilisateur est déjà pris."
        case .ageRequirementNotMet: "Vous devez avoir au moins \(minimumAge) ans pour créer un compte."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        case .mediaRejected: "Cette photo n'a pas pu être utilisée. Choisissez-en une autre."
        case .profileNotFound, .userNotFound, .profileAlreadyExists, .invalidInput, .unexpectedResponse:
            "Une erreur est survenue. Réessayez."
        }
    }
}

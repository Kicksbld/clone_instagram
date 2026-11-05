import Foundation

/// Où le paywall est ouvert : fin d'onboarding ou Paramètres > Clone Plus.
enum PaywallSource: String, Sendable {
    case onboarding
    case settings
}

/// D'où vient un like : bouton J'aime ou double tap sur la photo.
enum LikeSource: String, Sendable {
    case button
    case doubleTap = "double_tap"
}

/// D'où vient un abonnement à un compte : son profil ou une liste d'abonnés.
enum FollowSource: String, Sendable {
    case profile
    case list
}

/**
 Événements de l'app, noms centralisés (ADR-013) : `objet_action` en `snake_case`, au passé. Propriétés
 typées et techniques uniquement : jamais d'email, de nom, de username, d'identifiant de contenu ni de texte.
 */
enum AnalyticsEvent: Equatable, Sendable {
    case onboardingStepCompleted(OnboardingStepName)
    case paywallViewed(PaywallVariant, PaywallSource)
    case purchaseStarted(PaywallVariant, PaywallSource)
    case purchaseCompleted(PaywallVariant, PaywallSource)
    case purchaseCancelled(PaywallVariant, PaywallSource)
    case postPublished(mediaCount: Int)
    case postLiked(LikeSource)
    case userFollowed(FollowSource)
    /// Écran du parcours d'onboarding affiché (ADR-038) : base de l'entonnoir écran par écran.
    case onboardingScreenViewed(OnboardingScreen)
    /// Une réponse choisie au quiz (un événement par valeur, au passage à l'écran suivant).
    case onboardingQuizAnswered(OnboardingQuizAnswer)
    case onboardingInteractionCompleted(OnboardingInteraction)
    /// « Passer » : le reste du hook est sauté, l'inscription commence.
    case onboardingSkipped(OnboardingScreen)
    case onboardingSoundToggled(muted: Bool)
    case notificationPermissionResponded(granted: Bool)

    var name: String {
        switch self {
        case .onboardingStepCompleted: "onboarding_step_completed"
        case .paywallViewed: "paywall_viewed"
        case .purchaseStarted: "purchase_started"
        case .purchaseCompleted: "purchase_completed"
        case .purchaseCancelled: "purchase_cancelled"
        case .postPublished: "post_published"
        case .postLiked: "post_liked"
        case .userFollowed: "user_followed"
        case .onboardingScreenViewed: "onboarding_screen_viewed"
        case .onboardingQuizAnswered: "onboarding_quiz_answered"
        case .onboardingInteractionCompleted: "onboarding_interaction_completed"
        case .onboardingSkipped: "onboarding_skipped"
        case .onboardingSoundToggled: "onboarding_sound_toggled"
        case .notificationPermissionResponded: "notification_permission_responded"
        }
    }

    var properties: [String: String] {
        switch self {
        case let .onboardingStepCompleted(step):
            ["step": step.rawValue]
        case let .paywallViewed(variant, source),
             let .purchaseStarted(variant, source),
             let .purchaseCompleted(variant, source),
             let .purchaseCancelled(variant, source):
            ["variant": variant.rawValue, "source": source.rawValue]
        case let .postPublished(mediaCount):
            ["media_count": String(mediaCount)]
        case let .postLiked(source):
            ["source": source.rawValue]
        case let .userFollowed(source):
            ["source": source.rawValue]
        case let .onboardingScreenViewed(screen):
            ["screen": screen.rawValue, "index": String(screen.index)]
        case let .onboardingQuizAnswered(answer):
            ["question": answer.question.rawValue, "answer": answer.value]
        case let .onboardingInteractionCompleted(interaction):
            ["kind": interaction.kind.rawValue, "method": interaction.method.rawValue]
        case let .onboardingSkipped(screen):
            ["screen": screen.rawValue]
        case let .onboardingSoundToggled(muted):
            ["muted": String(muted)]
        case let .notificationPermissionResponded(granted):
            ["granted": String(granted)]
        }
    }
}

/// Nom stable d'une étape de l'onboarding dans PostHog (indépendant des noms Swift).
enum OnboardingStepName: String, Sendable {
    case createAccount = "create_account"
    case email
    case confirmationCode = "confirmation_code"
    case password
    case birthDate = "birth_date"
    case fullName = "full_name"
    case username
    case terms
    case profilePhoto = "profile_photo"
    case bio
    case completed
}

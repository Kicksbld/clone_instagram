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

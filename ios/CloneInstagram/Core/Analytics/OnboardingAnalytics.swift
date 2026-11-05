/// Écrans du parcours d'onboarding (ADR-038), dans l'ordre : nom stable dans PostHog et position.
/// Le paywall de fin d'onboarding est mesuré par `paywall_viewed { source: onboarding }`.
enum OnboardingScreen: String, CaseIterable, Sendable {
    case welcome
    case intro
    case promise
    case quizInterests = "quiz_interests"
    case insightInterests = "insight_interests"
    case quizStyle = "quiz_style"
    case insightStyle = "insight_style"
    case quizRhythm = "quiz_rhythm"
    case likePost = "like_post"
    case firstPhoto = "first_photo"
    case celebration
    case bridge
    // Inscription (ADR-018) : mêmes noms que `OnboardingStepName`.
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
    case paywall
    case notificationPermission = "notification_permission"

    /// Position dans le parcours complet, à partir de 1.
    var index: Int {
        (Self.allCases.firstIndex(of: self) ?? 0) + 1
    }

    /// Avancement affiché par la barre de progression (0 à 1).
    var progress: Double {
        Double(index) / Double(Self.allCases.count)
    }
}

/// Question du quiz de l'onboarding.
enum OnboardingQuizQuestion: String, Sendable {
    case interests
    case postingStyle = "posting_style"
    case rhythm
}

/// Ce que l'utilisateur pense publier surtout.
enum OnboardingPostingStyle: String, CaseIterable, Sendable {
    case photos
    case stories
    case reels
    case watcher
}

/// À quelle fréquence il pense publier.
enum OnboardingRhythm: String, CaseIterable, Sendable {
    case daily
    case weekly
    case sometimes
}

/// Réponse au quiz : valeur d'énumération uniquement (aucun texte libre, ADR-013).
enum OnboardingQuizAnswer: Equatable, Sendable {
    case interest(OnboardingInterest)
    case postingStyle(OnboardingPostingStyle)
    case rhythm(OnboardingRhythm)

    var question: OnboardingQuizQuestion {
        switch self {
        case .interest: .interests
        case .postingStyle: .postingStyle
        case .rhythm: .rhythm
        }
    }

    var value: String {
        switch self {
        case let .interest(interest): interest.rawValue
        case let .postingStyle(style): style.rawValue
        case let .rhythm(rhythm): rhythm.rawValue
        }
    }
}

/// Interaction « learn by doing » réussie dans le hook.
struct OnboardingInteraction: Equatable, Sendable {
    enum Kind: String, Sendable {
        case like
        case photo
    }

    enum Method: String, Sendable {
        case doubleTap = "double_tap"
        case button
        case camera
        case library
    }

    let kind: Kind
    let method: Method
}

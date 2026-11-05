import Foundation

/// Écrans du hook, avant l'inscription (ADR-038), dans l'ordre.
enum OnboardingHookStep: CaseIterable, Hashable {
    /// La mascotte se présente.
    case intro
    /// Promesse de l'app en trois cartes.
    case promise
    case quizInterests
    case insightInterests
    case quizStyle
    case insightStyle
    case quizRhythm
    /// Double tap sur un faux post.
    case likePost
    /// Première photo, filtre, publication dans un faux feed.
    case firstPhoto
    case celebration
    /// Pont vers l'inscription.
    case bridge

    var screen: OnboardingScreen {
        switch self {
        case .intro: .intro
        case .promise: .promise
        case .quizInterests: .quizInterests
        case .insightInterests: .insightInterests
        case .quizStyle: .quizStyle
        case .insightStyle: .insightStyle
        case .quizRhythm: .quizRhythm
        case .likePost: .likePost
        case .firstPhoto: .firstPhoto
        case .celebration: .celebration
        case .bridge: .bridge
        }
    }

    var next: OnboardingHookStep? {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self), index + 1 < all.count else { return nil }
        return all[index + 1]
    }

    var previous: OnboardingHookStep? {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self), index > 0 else { return nil }
        return all[index - 1]
    }
}

/// Ce que le hook transmet à l'inscription : rien n'est envoyé à l'API avant la création du profil.
struct OnboardingHookResult: Equatable {
    /// Dans l'ordre du choix ; le premier personnalise le paywall.
    var interests: [OnboardingInterest] = []
    /// Photo publiée dans le faux feed, proposée à l'étape photo de profil.
    var photo: Data?
}

/// Filtre appliqué à l'affichage de la première photo (la photo envoyée ensuite reste l'originale).
enum OnboardingPhotoFilter: String, CaseIterable, Identifiable {
    case original
    case citron
    case vivid
    case noir

    var id: Self {
        self
    }

    var title: String {
        switch self {
        case .original: "Original"
        case .citron: "Citron"
        case .vivid: "Éclat"
        case .noir: "Noir"
        }
    }
}

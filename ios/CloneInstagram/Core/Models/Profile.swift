import Foundation

/// Statut du compte (ADR-005) : suspendu ou banni, l'app n'affiche que l'écran « Compte suspendu ».
enum AccountStatus: Equatable {
    case active
    case suspended
    case banned
}

/// Plan Clone Plus selon l'API (règle `isPlus`, ADR-012) : seul ce plan débloque un avantage.
enum Plan: Equatable {
    case free
    case plus
}

/// Mon plan et la fin de la période payée (`nil` en `free`).
struct PlanStatus: Equatable {
    let plan: Plan
    let expiresAt: Date?

    static let free = PlanStatus(plan: .free, expiresAt: nil)
}

/// Mon profil, modèle de l'app (distinct du type généré).
struct Profile: Equatable, Identifiable {
    let id: String
    var username: String
    var fullName: String
    var bio: String
    let isPrivate: Bool
    let status: AccountStatus
    let followerCount: Int
    /// Modifié par mes follows et unfollows, jusqu'au prochain chargement (`FollowStore`).
    var followingCount: Int
    let postCount: Int
    /// Photo de profil ; `nil` sans photo.
    var avatar: ImageVariants?
    /// Plan Clone Plus renvoyé par l'API (`GET /v1/me`, `POST /v1/me/subscription/refresh`).
    var planStatus: PlanStatus = .free

    var isPlus: Bool {
        planStatus.plan == .plus
    }
}

/// Profil d'un autre utilisateur, vu par moi (`GET /v1/users/{username}`, ADR-006).
struct UserProfile: Equatable, Identifiable {
    let id: String
    let username: String
    let fullName: String
    let bio: String
    let isPrivate: Bool
    /// Modifié par un follow ou un unfollow (valeur renvoyée par l'API).
    var followerCount: Int
    let followingCount: Int
    let postCount: Int
    let avatar: ImageVariants?
    /// Je suis ce compte ; modifié de façon optimiste par le bouton Suivre (ADR-010).
    var isFollowing: Bool
    /// Ce compte me suit (« Suivre en retour »).
    let followsMe: Bool
    /// Je peux voir ses contenus ; `false` pour un compte privé que je ne suis pas.
    let canViewContent: Bool
}

/// Disponibilité d'un username (ADR-018).
struct UsernameAvailability: Equatable {
    let username: String
    let available: Bool
    /// Vide si disponible ; sinon jusqu'à 3 usernames libres.
    let suggestions: [String]
}

/// Date de naissance au format du contrat (`AAAA-MM-JJ`), sans fuseau horaire.
struct BirthDate: Equatable {
    let year: Int
    let month: Int
    let day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// Jour de `date` dans le calendrier de l'utilisateur.
    init(_ date: Date, calendar: Calendar = .current) {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: components.year ?? 0, month: components.month ?? 1, day: components.day ?? 1)
    }

    var iso8601: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    /// Âge en années révolues au jour `today` (même règle que l'API).
    func age(on today: BirthDate) -> Int {
        let birthdayPassed = (today.month, today.day) >= (month, day)
        return today.year - year - (birthdayPassed ? 0 : 1)
    }
}

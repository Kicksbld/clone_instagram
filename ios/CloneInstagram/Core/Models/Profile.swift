import Foundation

/// Statut du compte (ADR-005) ; `suspended` et `banned` sont gérés en T14.
enum AccountStatus: Equatable {
    case active
    case suspended
    case banned
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
    let followingCount: Int
    let postCount: Int
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

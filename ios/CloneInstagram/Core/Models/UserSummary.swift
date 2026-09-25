import Foundation

/// Compte dans une liste d'abonnés ou un résultat de recherche, vu par moi (ADR-006).
struct UserSummary: Equatable, Identifiable {
    let id: String
    let username: String
    let fullName: String
    let isPrivate: Bool
    let avatar: ImageVariants?
    /// Je suis ce compte.
    var isFollowing: Bool
    /// Ce compte me suit.
    let followsMe: Bool
}

/// Une page d'une liste paginée par curseur (ADR-007) ; `nextCursor` est `nil` sur la dernière page.
struct UserPage: Equatable {
    let items: [UserSummary]
    let nextCursor: String?
}

/// Relation après un follow ou un unfollow, et compteur d'abonnés du compte visé.
struct FollowStatus: Equatable {
    let isFollowing: Bool
    let followerCount: Int
}

/// Liste d'un compte : ses abonnés ou ses abonnements.
enum FollowListKind: Hashable, CaseIterable {
    case followers
    case following
}

import Foundation
@testable import CloneInstagram

/// Faux `SocialService` : réponses programmables, requêtes enregistrées.
final class FakeSocialService: SocialService {
    struct ListRequest: Equatable {
        let kind: FollowListKind
        let userId: String
        let cursor: String?
    }

    /// Réponses successives de `follow` / `unfollow` ; succès calculé quand la liste est vide.
    var followResults: [Result<FollowStatus, SocialServiceError>] = []
    /// Réponses successives de `list` ; page vide quand la liste est vide.
    var listResults: [Result<UserPage, SocialServiceError>] = []
    /// Réponses successives de `searchUsers` ; aucun résultat quand la liste est vide.
    var searchResults: [Result<[UserSummary], SocialServiceError>] = []
    /// Appelé pendant `searchUsers`, avant la réponse (ex. l'utilisateur tape encore).
    var onSearch: (() -> Void)?

    private(set) var follows: [String] = []
    private(set) var unfollows: [String] = []
    private(set) var listRequests: [ListRequest] = []
    private(set) var searches: [String] = []

    func follow(userId: String) async throws(SocialServiceError) -> FollowStatus {
        follows.append(userId)
        guard !followResults.isEmpty else { return FollowStatus(isFollowing: true, followerCount: 1) }
        return try followResults.removeFirst().get()
    }

    func unfollow(userId: String) async throws(SocialServiceError) -> FollowStatus {
        unfollows.append(userId)
        guard !followResults.isEmpty else { return FollowStatus(isFollowing: false, followerCount: 0) }
        return try followResults.removeFirst().get()
    }

    func list(_ kind: FollowListKind, of userId: String, cursor: String?) async throws(SocialServiceError) -> UserPage {
        listRequests.append(ListRequest(kind: kind, userId: userId, cursor: cursor))
        guard !listResults.isEmpty else { return UserPage(items: [], nextCursor: nil) }
        return try listResults.removeFirst().get()
    }

    func searchUsers(_ query: String) async throws(SocialServiceError) -> [UserSummary] {
        searches.append(query)
        onSearch?()
        guard !searchResults.isEmpty else { return [] }
        return try searchResults.removeFirst().get()
    }
}

extension UserSummary {
    static func fixture(
        id: String = "0199a1b2-5eed-7000-8000-000000000002",
        username: String = "hugo.bernard",
        isPrivate: Bool = false,
        isFollowing: Bool = false,
        followsMe: Bool = false
    ) -> UserSummary {
        UserSummary(
            id: id,
            username: username,
            fullName: "Hugo Bernard",
            isPrivate: isPrivate,
            avatar: nil,
            isFollowing: isFollowing,
            followsMe: followsMe
        )
    }
}

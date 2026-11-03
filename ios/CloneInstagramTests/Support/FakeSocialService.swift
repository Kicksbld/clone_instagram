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
    /// Appelé pendant `follow` / `unfollow`, avant la réponse (ex. l'utilisateur touche encore le bouton).
    var duringFollow: (() async -> Void)?
    /// Réponses successives de `list` ; page vide quand la liste est vide.
    var listResults: [Result<UserPage, SocialServiceError>] = []
    /// Réponses successives de `searchUsers` ; aucun résultat quand la liste est vide.
    var searchResults: [Result<[UserSummary], SocialServiceError>] = []
    /// Appelé pendant `searchUsers`, avant la réponse (ex. l'utilisateur tape encore).
    var onSearch: (() -> Void)?
    /// Erreurs successives de `block` / `unblock` ; succès quand la liste est vide.
    var blockErrors: [SocialServiceError] = []
    /// Appelé pendant `block` / `unblock`, avant la réponse (ex. l'utilisateur débloque aussitôt).
    var duringBlock: (() async -> Void)?
    /// Réponses successives de `listBlocks` ; page vide quand la liste est vide.
    var blockListResults: [Result<UserPage, SocialServiceError>] = []

    /// Réponses successives de `listFollowRequests` ; page vide quand la liste est vide.
    var followRequestResults: [Result<UserPage, SocialServiceError>] = []
    /// Erreurs successives de `acceptFollowRequest` / `declineFollowRequest` / `removeFollower` ; succès quand vide.
    var followRequestErrors: [SocialServiceError] = []
    /// Appelé pendant une réponse à une demande ou un retrait d'abonné, avant la réponse de l'API.
    var duringFollowRequest: (() async -> Void)?

    /// Réponses successives de `listCloseFriends` ; page vide quand la liste est vide.
    var closeFriendListResults: [Result<UserPage, SocialServiceError>] = []
    /// Erreurs successives de `addCloseFriend` / `removeCloseFriend` ; succès quand la liste est vide.
    var closeFriendErrors: [SocialServiceError] = []
    /// Appelé pendant un ajout ou un retrait d'ami proche, avant la réponse (ex. l'utilisateur touche encore).
    var duringCloseFriend: (() async -> Void)?
    private(set) var closeFriendListCursors: [String?] = []
    private(set) var addedCloseFriends: [String] = []
    private(set) var removedCloseFriends: [String] = []

    private(set) var follows: [String] = []
    private(set) var acceptedRequests: [String] = []
    private(set) var declinedRequests: [String] = []
    private(set) var removedFollowers: [String] = []
    private(set) var followRequestCursors: [String?] = []
    private(set) var unfollows: [String] = []
    private(set) var listRequests: [ListRequest] = []
    private(set) var searches: [String] = []
    private(set) var blocks: [String] = []
    private(set) var unblocks: [String] = []
    private(set) var blockListCursors: [String?] = []

    func follow(userId: String) async throws(SocialServiceError) -> FollowStatus {
        follows.append(userId)
        await runDuringFollow()
        guard !followResults.isEmpty else { return FollowStatus(isFollowing: true, followerCount: 1) }
        return try followResults.removeFirst().get()
    }

    func unfollow(userId: String) async throws(SocialServiceError) -> FollowStatus {
        unfollows.append(userId)
        await runDuringFollow()
        guard !followResults.isEmpty else { return FollowStatus(isFollowing: false, followerCount: 0) }
        return try followResults.removeFirst().get()
    }

    private func runDuringFollow() async {
        guard let duringFollow else { return }
        self.duringFollow = nil
        await duringFollow()
    }

    func removeFollower(userId: String) async throws(SocialServiceError) {
        removedFollowers.append(userId)
        try await answerFollowRequest()
    }

    func listFollowRequests(cursor: String?) async throws(SocialServiceError) -> UserPage {
        followRequestCursors.append(cursor)
        guard !followRequestResults.isEmpty else { return UserPage(items: [], nextCursor: nil) }
        return try followRequestResults.removeFirst().get()
    }

    func acceptFollowRequest(from requesterId: String) async throws(SocialServiceError) {
        acceptedRequests.append(requesterId)
        try await answerFollowRequest()
    }

    func declineFollowRequest(from requesterId: String) async throws(SocialServiceError) {
        declinedRequests.append(requesterId)
        try await answerFollowRequest()
    }

    private func answerFollowRequest() async throws(SocialServiceError) {
        if let duringFollowRequest {
            self.duringFollowRequest = nil
            await duringFollowRequest()
        }
        if !followRequestErrors.isEmpty {
            throw followRequestErrors.removeFirst()
        }
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

    func block(userId: String) async throws(SocialServiceError) {
        blocks.append(userId)
        await runDuringBlock()
        if !blockErrors.isEmpty {
            throw blockErrors.removeFirst()
        }
    }

    func unblock(userId: String) async throws(SocialServiceError) {
        unblocks.append(userId)
        await runDuringBlock()
        if !blockErrors.isEmpty {
            throw blockErrors.removeFirst()
        }
    }

    private func runDuringBlock() async {
        guard let duringBlock else { return }
        self.duringBlock = nil
        await duringBlock()
    }

    func listBlocks(cursor: String?) async throws(SocialServiceError) -> UserPage {
        blockListCursors.append(cursor)
        guard !blockListResults.isEmpty else { return UserPage(items: [], nextCursor: nil) }
        return try blockListResults.removeFirst().get()
    }
}

extension FakeSocialService {
    func listCloseFriends(cursor: String?) async throws(SocialServiceError) -> UserPage {
        closeFriendListCursors.append(cursor)
        guard !closeFriendListResults.isEmpty else { return UserPage(items: [], nextCursor: nil) }
        return try closeFriendListResults.removeFirst().get()
    }

    func addCloseFriend(userId: String) async throws(SocialServiceError) {
        addedCloseFriends.append(userId)
        try await answerCloseFriend()
    }

    func removeCloseFriend(userId: String) async throws(SocialServiceError) {
        removedCloseFriends.append(userId)
        try await answerCloseFriend()
    }

    private func answerCloseFriend() async throws(SocialServiceError) {
        if let duringCloseFriend {
            self.duringCloseFriend = nil
            await duringCloseFriend()
        }
        if !closeFriendErrors.isEmpty {
            throw closeFriendErrors.removeFirst()
        }
    }
}

extension UserSummary {
    static func fixture(
        id: String = "0199a1b2-5eed-7000-8000-000000000002",
        username: String = "hugo.bernard",
        isPrivate: Bool = false,
        isFollowing: Bool = false,
        followsMe: Bool = false,
        isRequested: Bool = false
    ) -> UserSummary {
        UserSummary(
            id: id,
            username: username,
            fullName: "Hugo Bernard",
            isPrivate: isPrivate,
            avatar: nil,
            isFollowing: isFollowing,
            followsMe: followsMe,
            isRequested: isRequested
        )
    }
}

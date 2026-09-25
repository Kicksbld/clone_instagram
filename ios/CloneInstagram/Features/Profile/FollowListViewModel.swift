import Foundation
import Observation

/// Abonnés ou abonnements d'un compte (`GET /v1/users/{id}/followers|following`) : pagination par
/// curseur, bouton Suivre optimiste sur chaque ligne (ADR-010).
@Observable
final class FollowListViewModel {
    enum State: Equatable {
        case loading
        case loaded
        /// Compte invisible, ou privé et non suivi (ADR-006).
        case notFound
        case failed(message: String)
    }

    let kind: FollowListKind
    private(set) var state: State = .loading
    private(set) var users: [UserSummary] = []
    private(set) var isLoadingMore = false
    /// Échec d'une action (page suivante, follow), affiché en alerte ; `nil` une fois fermée.
    var actionErrorMessage: String?

    private let userId: String
    private let viewerId: String
    private let social: any SocialService
    private let onFollowChange: () async -> Void
    private var nextCursor: String?
    private var pendingFollows: Set<String> = []

    var hasMore: Bool {
        nextCursor != nil
    }

    init(
        kind: FollowListKind,
        userId: String,
        viewerId: String,
        social: any SocialService,
        onFollowChange: @escaping () async -> Void = {}
    ) {
        self.kind = kind
        self.userId = userId
        self.viewerId = viewerId
        self.social = social
        self.onFollowChange = onFollowChange
    }

    /// Pas de bouton sur moi-même, ni sur un compte privé que je ne suis pas (P1).
    func canFollow(_ user: UserSummary) -> Bool {
        user.id != viewerId && (user.isFollowing || !user.isPrivate)
    }

    /// Première page ; un rafraîchissement garde la liste affichée pendant le chargement.
    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await social.list(kind, of: userId, cursor: nil)
            users = page.items
            nextCursor = page.nextCursor
            state = .loaded
        } catch .userNotFound {
            state = .notFound
        } catch {
            if state != .loaded {
                state = .failed(message: "Impossible de charger la liste. Vérifiez votre connexion et réessayez.")
            }
        }
    }

    /// Page suivante, appelée quand la dernière ligne apparaît.
    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await social.list(kind, of: userId, cursor: cursor)
            let known = Set(users.map(\.id))
            users += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            actionErrorMessage = "Impossible de charger la suite. Vérifiez votre connexion et réessayez."
        }
    }

    func setFollowing(_ following: Bool, for user: UserSummary) async {
        guard canFollow(user), user.isFollowing != following, !pendingFollows.contains(user.id) else { return }
        pendingFollows.insert(user.id)
        defer { pendingFollows.remove(user.id) }

        update(user.id) { $0.isFollowing = following }
        do {
            let status = if following {
                try await social.follow(userId: user.id)
            } else {
                try await social.unfollow(userId: user.id)
            }
            update(user.id) { $0.isFollowing = status.isFollowing }
            await onFollowChange()
        } catch .userNotFound {
            users.removeAll { $0.id == user.id }
        } catch {
            update(user.id) { $0.isFollowing = user.isFollowing }
            actionErrorMessage = error == .accountPrivate
                ? "Ce compte est privé : il ne peut pas encore être suivi."
                : "Action impossible. Vérifiez votre connexion et réessayez."
        }
    }

    private func update(_ id: String, _ change: (inout UserSummary) -> Void) {
        guard let index = users.firstIndex(where: { $0.id == id }) else { return }
        change(&users[index])
    }
}

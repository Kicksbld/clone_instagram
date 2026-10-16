import Foundation
import Observation

/// Abonnés ou abonnements d'un compte (`GET /v1/users/{id}/followers|following`) : pagination par
/// curseur, bouton Suivre optimiste sur chaque ligne, partagé avec les autres écrans (`FollowStore`, ADR-020).
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
    /// Comptes reçus de l'API, affichés avec l'abonnement partagé par `FollowStore`.
    private var loadedUsers: [UserSummary] = []
    private(set) var isLoadingMore = false
    /// Échec d'une action (page suivante, follow), affiché en alerte ; `nil` une fois fermée.
    var actionErrorMessage: String?

    private let userId: String
    private let viewerId: String
    private let social: any SocialService
    private let follows: FollowStore
    private var nextCursor: String?

    var users: [UserSummary] {
        loadedUsers.map { follows.displayed($0) }
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    init(
        kind: FollowListKind,
        userId: String,
        viewerId: String,
        social: any SocialService,
        follows: FollowStore
    ) {
        self.kind = kind
        self.userId = userId
        self.viewerId = viewerId
        self.social = social
        self.follows = follows
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
            follows.record(page.items)
            loadedUsers = page.items
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
            let known = Set(loadedUsers.map(\.id))
            let added = page.items.filter { !known.contains($0.id) }
            follows.record(added)
            loadedUsers += added
            nextCursor = page.nextCursor
        } catch {
            actionErrorMessage = "Impossible de charger la suite. Vérifiez votre connexion et réessayez."
        }
    }

    /// Changé tout de suite, sans bloquer le bouton : un nouveau tap pendant l'appel est pris en compte.
    func setFollowing(_ following: Bool, for user: UserSummary) async {
        let user = follows.displayed(user)
        guard canFollow(user), user.isFollowing != following else { return }
        let outcome = await follows.setFollowing(following, userId: user.id, current: FollowState(user), source: .list)
        switch outcome {
        case nil, .confirmed?:
            break
        case .userGone?:
            loadedUsers.removeAll { $0.id == user.id }
        case let .reverted(message)?:
            actionErrorMessage = message
        }
    }
}

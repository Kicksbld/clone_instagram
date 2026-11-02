import Foundation
import Observation

/// Abonnés ou abonnements d'un compte (`GET /v1/users/{id}/followers|following`) : pagination par
/// curseur, bouton Suivre optimiste sur chaque ligne, partagé avec les autres écrans (`FollowStore`, ADR-020).
/// Dans mes propres abonnés, « Supprimer » retire un abonné (`DELETE /v1/users/{id}/follower`), optimiste.
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
    /// Abonnés retirés de l'écran tout de suite ; réaffichés si le retrait échoue.
    private var removedFollowerIds: Set<String> = []
    /// Un seul retrait en cours par abonné (ADR-020).
    @ObservationIgnored private let removals = OptimisticSync<String, Bool>()

    var users: [UserSummary] {
        loadedUsers.filter { !removedFollowerIds.contains($0.id) }.map { follows.displayed($0) }
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

    /// Bouton Suivre sur tout compte sauf moi ; un compte privé reçoit une demande d'abonnement.
    func canFollow(_ user: UserSummary) -> Bool {
        user.id != viewerId
    }

    /// « Supprimer » : seulement dans la liste de mes propres abonnés.
    func canRemoveFollower(_ user: UserSummary) -> Bool {
        kind == .followers && userId == viewerId && user.id != viewerId
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
        guard canFollow(user), FollowState(user).wantsFollow != following else { return }
        let outcome = await follows.setFollowing(
            following,
            userId: user.id,
            current: FollowState(user),
            isPrivate: user.isPrivate,
            source: .list
        )
        switch outcome {
        case nil, .confirmed?:
            break
        case .userGone?:
            loadedUsers.removeAll { $0.id == user.id }
        case let .reverted(message)?:
            actionErrorMessage = message
        }
    }

    /// Retire `user` de mes abonnés : la ligne disparaît tout de suite, revient avec une alerte si l'API échoue.
    func removeFollower(_ user: UserSummary) async {
        guard canRemoveFollower(user), !removedFollowerIds.contains(user.id) else { return }
        removedFollowerIds.insert(user.id)
        let outcome = await removals.sync(
            user.id,
            to: true,
            confirmed: false,
            intentOf: \.self
        ) { _ throws(SocialServiceError) -> Bool in
            try await social.removeFollower(userId: user.id)
            return true
        }
        switch outcome {
        case .pending, .confirmed:
            break
        case .failed(.userNotFound, _, _):
            // Compte devenu invisible : il ne revient pas.
            loadedUsers.removeAll { $0.id == user.id }
            removedFollowerIds.remove(user.id)
        case .failed:
            removedFollowerIds.remove(user.id)
            actionErrorMessage = "Impossible de supprimer cet abonné. Vérifiez votre connexion et réessayez."
        }
    }
}

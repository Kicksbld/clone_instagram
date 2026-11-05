import Foundation
import Observation

/**
 Paramètres > Amis proches : ma liste privée (`GET /v1/me/close-friends`, pages de 20) et une recherche
 d'utilisateurs (`GET /v1/search/users`) pour en ajouter. Ajout et retrait optimistes sur `OptimisticSync`
 (ADR-020) : changés tout de suite, sans bloquer le bouton, retour arrière et alerte en cas d'échec. Comme
 Instagram, un compte retiré reste affiché avec « Ajouter » jusqu'au prochain chargement. Seul cet écran affiche
 les amis proches : pas de store partagé.

 L'API ne dit pas, dans un résultat de recherche, si le compte est un ami proche : l'état affiché est celui des
 comptes connus de la liste chargée. Ajouter un compte déjà dans la liste (pages non chargées) est sans effet
 côté API (`PUT` idempotent).
 */
@Observable
final class CloseFriendsViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(message: String)
    }

    enum SearchState: Equatable {
        /// Champ vide : la liste est affichée.
        case idle
        case searching
        case results([UserSummary])
        case failed(message: String)
    }

    private(set) var state: State = .loading
    /// Ma liste : comptes chargés, puis ceux ajoutés depuis l'ouverture (en tête).
    private(set) var users: [UserSummary] = []
    private(set) var isLoadingMore = false
    private(set) var searchState: SearchState = .idle
    var query = ""
    /// Échec d'une action, affiché en alerte ; `nil` une fois fermée.
    var actionErrorMessage: String?

    /// Amis proches affichés : état voulu pendant un appel, puis confirmé par l'API.
    private var members: Set<String> = []
    /// Amis proches confirmés par l'API (liste chargée ou réponse d'un ajout / retrait).
    private var confirmed: Set<String> = []
    private let sync = OptimisticSync<String, Bool>()
    private let viewerId: String
    private let social: any SocialService
    private var nextCursor: String?

    init(viewerId: String, social: any SocialService) {
        self.viewerId = viewerId
        self.social = social
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    func isCloseFriend(_ user: UserSummary) -> Bool {
        members.contains(user.id)
    }

    /// Texte envoyé à l'API : sans espaces superflus ni `@` initial (même nettoyage que l'API).
    var normalizedQuery: String {
        var text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasPrefix("@") {
            text.removeFirst()
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await social.listCloseFriends(cursor: nil)
            record(page.items)
            // Comptes ajoutés pendant un appel encore en cours : gardés en tête de liste.
            let listed = Set(page.items.map(\.id))
            let pending = users.filter { sync.isSyncing($0.id) && !listed.contains($0.id) }
            users = pending + page.items
            nextCursor = page.nextCursor
            state = .loaded
        } catch {
            if state != .loaded {
                state = .failed(message: "Impossible de charger vos amis proches. Vérifiez votre connexion et réessayez.")
            }
        }
    }

    /// Page suivante, appelée quand la dernière ligne apparaît.
    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await social.listCloseFriends(cursor: cursor)
            let known = Set(users.map(\.id))
            let added = page.items.filter { !known.contains($0.id) }
            record(added)
            users += added
            nextCursor = page.nextCursor
        } catch {
            actionErrorMessage = "Impossible de charger la suite. Vérifiez votre connexion et réessayez."
        }
    }

    /// Lancée par la vue 300 ms après la dernière frappe ; une réponse d'une requête dépassée est ignorée.
    func search() async {
        let text = normalizedQuery
        guard !text.isEmpty else {
            searchState = .idle
            return
        }
        if case .results = searchState {} else {
            searchState = .searching
        }
        do {
            let found = try await social.searchUsers(String(text.prefix(64)))
            guard text == normalizedQuery, !Task.isCancelled else { return }
            // On ne s'ajoute pas soi-même (`422 cannot_close_friend_self`).
            searchState = .results(found.filter { $0.id != viewerId })
        } catch {
            guard text == normalizedQuery, !Task.isCancelled else { return }
            searchState = .failed(message: "Impossible de lancer la recherche. Vérifiez votre connexion et réessayez.")
        }
    }

    /// « Ajouter » ou « Retirer » : changé tout de suite ; un tap pendant l'appel ne change que l'état voulu.
    func toggle(_ user: UserSummary) async {
        let wanted = !isCloseFriend(user)
        let wasShown = users.contains { $0.id == user.id }
        apply(wanted, to: user)

        let outcome = await sync.sync(
            user.id,
            to: wanted,
            confirmed: confirmed.contains(user.id),
            intentOf: { $0 }
        ) { intent throws(SocialServiceError) -> Bool in
            if intent {
                try await social.addCloseFriend(userId: user.id)
            } else {
                try await social.removeCloseFriend(userId: user.id)
            }
            return intent
        }
        switch outcome {
        case .pending:
            break
        case let .confirmed(isMember):
            setConfirmed(isMember, for: user.id)
            AccessibilityFeedback.announce(isMember ? "Compte ajouté aux amis proches" : "Compte retiré des amis proches")
            apply(isMember, to: user)
        case let .failed(error, _, wasMember):
            if error == .userNotFound {
                // Compte devenu invisible (bloqué, supprimé…) : retiré de l'écran (ADR-020).
                setConfirmed(false, for: user.id)
                members.remove(user.id)
                users.removeAll { $0.id == user.id }
                if case let .results(found) = searchState {
                    searchState = .results(found.filter { $0.id != user.id })
                }
            } else {
                apply(wasMember, to: user)
                // Ajout refusé d'un compte venu de la recherche : retiré de la liste où il venait d'apparaître.
                if !wasMember, !wasShown {
                    users.removeAll { $0.id == user.id }
                }
            }
            actionErrorMessage = Self.message(for: error)
        }
    }

    /// Comptes reçus de la liste : amis proches confirmés, sauf pendant un changement en cours.
    private func record(_ listed: [UserSummary]) {
        for user in listed where !sync.isSyncing(user.id) {
            confirmed.insert(user.id)
            members.insert(user.id)
        }
    }

    private func setConfirmed(_ isMember: Bool, for userId: String) {
        if isMember {
            confirmed.insert(userId)
        } else {
            confirmed.remove(userId)
        }
    }

    /// Affichage : ami proche ou non ; un compte ajouté depuis la recherche apparaît en tête de liste.
    private func apply(_ isMember: Bool, to user: UserSummary) {
        if isMember {
            members.insert(user.id)
            if !users.contains(where: { $0.id == user.id }) {
                users.insert(user, at: 0)
            }
        } else {
            members.remove(user.id)
        }
    }

    static func message(for error: SocialServiceError) -> String {
        switch error {
        case .userNotFound:
            "Ce compte n'est plus disponible."
        case .unreachable:
            "Connexion impossible. Vérifiez votre réseau, puis réessayez."
        default:
            "Une erreur est survenue. Réessayez."
        }
    }
}

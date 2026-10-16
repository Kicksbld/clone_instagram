import Foundation
import Observation

/// Onglet Recherche (`GET /v1/search/users`) : comptes par username ou nom (ADR-006). La vue lance
/// `search()` 300 ms après la dernière frappe ; une réponse d'une requête dépassée est ignorée.
@Observable
final class SearchViewModel {
    enum State: Equatable {
        /// Champ vide : rien à afficher.
        case idle
        case searching
        case results([UserSummary])
        case failed(message: String)
    }

    var query = ""
    /// Résultats reçus de l'API, affichés avec l'abonnement partagé par `FollowStore` (« Suivi(e) »).
    private var searchState: State = .idle

    /// Comptes bloqués pendant la session : masqués à l'affichage, réaffichés si le blocage échoue (ADR-020).
    private var hiddenUserIds: Set<String> = []
    private let social: any SocialService
    private let follows: FollowStore

    var state: State {
        if case let .results(users) = searchState {
            .results(users.filter { !hiddenUserIds.contains($0.id) }.map { follows.displayed($0) })
        } else {
            searchState
        }
    }

    /// Texte envoyé à l'API : sans espaces superflus ni `@` initial (même nettoyage que l'API).
    var normalizedQuery: String {
        var text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasPrefix("@") {
            text.removeFirst()
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    init(social: any SocialService, follows: FollowStore) {
        self.social = social
        self.follows = follows
    }

    func search() async {
        let text = normalizedQuery
        guard !text.isEmpty else {
            searchState = .idle
            return
        }
        // Les résultats précédents restent affichés pendant la nouvelle recherche.
        if case .results = searchState {} else {
            searchState = .searching
        }
        do {
            let users = try await social.searchUsers(String(text.prefix(64)))
            guard text == normalizedQuery, !Task.isCancelled else { return }
            follows.record(users)
            searchState = .results(users)
        } catch {
            guard text == normalizedQuery, !Task.isCancelled else { return }
            searchState = .failed(message: "Impossible de lancer la recherche. Vérifiez votre connexion et réessayez.")
        }
    }

    /// Comptes bloqués pendant la session : retirés des résultats affichés (ADR-006), réaffichés si le
    /// blocage échoue (`BlockStore`).
    func hideUsers(_ ids: Set<String>) {
        hiddenUserIds = ids
    }
}

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
    private(set) var state: State = .idle

    private let social: any SocialService

    /// Texte envoyé à l'API : sans espaces superflus ni `@` initial (même nettoyage que l'API).
    var normalizedQuery: String {
        var text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasPrefix("@") {
            text.removeFirst()
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    init(social: any SocialService) {
        self.social = social
    }

    func search() async {
        let text = normalizedQuery
        guard !text.isEmpty else {
            state = .idle
            return
        }
        // Les résultats précédents restent affichés pendant la nouvelle recherche.
        if case .results = state {} else {
            state = .searching
        }
        do {
            let users = try await social.searchUsers(String(text.prefix(64)))
            guard text == normalizedQuery, !Task.isCancelled else { return }
            state = .results(users)
        } catch {
            guard text == normalizedQuery, !Task.isCancelled else { return }
            state = .failed(message: "Impossible de lancer la recherche. Vérifiez votre connexion et réessayez.")
        }
    }
}

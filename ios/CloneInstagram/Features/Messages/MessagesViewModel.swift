import Foundation
import Observation

@Observable
final class MessagesViewModel {
    let store: MessagingStore
    var query = ""
    private(set) var results: [UserSummary] = []
    var searchError: String?
    private let social: any SocialService
    private let viewerId: String

    init(store: MessagingStore, social: any SocialService, viewerId: String) {
        self.store = store
        self.social = social
        self.viewerId = viewerId
    }

    func search() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { results = []; searchError = nil; return }
        do {
            let users = try await social.searchUsers(String(text.prefix(64)))
            guard text == query.trimmingCharacters(in: .whitespacesAndNewlines), !Task.isCancelled else { return }
            results = users.filter { $0.id != viewerId }
            searchError = nil
        } catch {
            guard !Task.isCancelled else { return }
            searchError = "Recherche indisponible. Réessayez."
        }
    }
}

import Foundation
import Observation

@Observable
final class MentionSuggestionsViewModel {
    private(set) var users: [UserSummary] = []
    private(set) var errorMessage: String?
    private var revision = 0

    static func query(in text: String) -> String? {
        guard let range = text.range(of: #"(?<![\p{L}\p{N}_.@])@[a-zA-Z0-9_.]{0,30}$"#, options: .regularExpression) else { return nil }
        return String(text[range].dropFirst())
    }

    func clear() {
        revision += 1
        users = []
        errorMessage = nil
    }

    func search(_ text: String, using service: any SocialService) async {
        revision += 1
        let request = revision
        users = []
        errorMessage = nil
        guard let query = Self.query(in: text), !query.isEmpty else { return }
        do {
            let found = try await service.searchUsers(query)
            guard revision == request, !Task.isCancelled else { return }
            users = Array(found.prefix(5))
        } catch {
            guard revision == request, !Task.isCancelled else { return }
            errorMessage = "Suggestions indisponibles. Réessayer"
        }
    }

    func selecting(_ user: UserSummary, in text: String) -> String {
        guard let query = Self.query(in: text) else { return text }
        return String(text.dropLast(query.count + 1)) + "@\(user.username) "
    }
}

import Foundation

/// Jeton de Participant du Live commun (echimine/live-sdk), signé par l'API avec le secret de l'App membre,
/// jamais par l'app : `POST /v1/live/participant-token` → `{ "token": "…" }`.
nonisolated struct LiveParticipantTokenClient: Sendable {
    /// Serveur Live commun aux clones.
    static let serverURL = URL(string: "https://live.echimine.fr")!

    let apiBaseURL: URL
    let accessToken: @Sendable () async -> String?

    func fetch() async throws -> String {
        guard let accessToken = await accessToken() else { throw LiveTokenError.unauthenticated }
        var request = URLRequest(url: apiBaseURL.appending(path: "v1/live/participant-token"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw LiveTokenError.refused }
        return try JSONDecoder().decode(Body.self, from: data).token
    }

    private struct Body: Decodable {
        let token: String
    }
}

nonisolated enum LiveTokenError: Error {
    case unauthenticated
    case refused
}

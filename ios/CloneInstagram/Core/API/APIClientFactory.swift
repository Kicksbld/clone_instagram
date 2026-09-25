import APIClient
import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// Construit le client généré par `swift-openapi-generator` (ADR-003), avec le middleware d'authentification.
enum APIClientFactory {
    static func makeClient(
        configuration: APIConfiguration,
        transport: any ClientTransport = URLSessionTransport(),
        accessToken: @escaping @Sendable () async -> String? = { nil }
    ) -> Client {
        Client(
            serverURL: configuration.baseURL,
            // L'API renvoie ses dates avec les millisecondes (`2026-09-25T12:00:00.000Z`).
            configuration: Configuration(dateTranscoder: .iso8601WithFractionalSeconds),
            transport: transport,
            middlewares: [AuthenticationMiddleware(accessToken: accessToken)]
        )
    }
}

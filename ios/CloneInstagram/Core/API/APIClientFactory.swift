import APIClient
import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// Construit le client généré par `swift-openapi-generator` (ADR-003).
/// Le middleware d'authentification sera ajouté en T2.
enum APIClientFactory {
    static func makeClient(
        configuration: APIConfiguration,
        transport: any ClientTransport = URLSessionTransport()
    ) -> Client {
        Client(serverURL: configuration.baseURL, transport: transport)
    }
}

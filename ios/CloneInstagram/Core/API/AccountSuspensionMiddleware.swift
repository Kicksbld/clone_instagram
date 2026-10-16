import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Repère `403 account_suspended` sur n'importe quelle route (ADR-005) et le signale, sans changer la
/// réponse : le service appelant traite l'erreur comme d'habitude, le routeur racine affiche l'écran
/// « Compte suspendu ».
nonisolated struct AccountSuspensionMiddleware: ClientMiddleware {
    /// Un Problem Details tient largement dans cette taille ; au-delà, la réponse n'est pas examinée.
    private static let maxProblemSize = 64 * 1024

    let onAccountSuspended: @Sendable () async -> Void

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID _: String,
        next: @concurrent @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)
        guard response.status == .forbidden, let responseBody else { return (response, responseBody) }
        // Le corps ne se lit qu'une fois : il est relu en mémoire, puis rendu tel quel.
        let data = try await Data(collecting: responseBody, upTo: Self.maxProblemSize)
        if Self.isAccountSuspended(data) {
            await onAccountSuspended()
        }
        return (response, HTTPBody(data))
    }

    private struct Problem: Decodable {
        let code: String
    }

    static func isAccountSuspended(_ data: Data) -> Bool {
        (try? JSONDecoder().decode(Problem.self, from: data))?.code == "account_suspended"
    }
}

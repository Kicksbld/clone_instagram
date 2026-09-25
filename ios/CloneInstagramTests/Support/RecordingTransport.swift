import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Transport factice qui garde la dernière requête envoyée et répond `404` (Problem Details).
final nonisolated class RecordingTransport: ClientTransport, @unchecked Sendable {
    /// Accès séquentiel dans les tests : un seul appel à la fois.
    private(set) var lastRequest: HTTPRequest?

    func send(
        _ request: HTTPRequest,
        body _: HTTPBody?,
        baseURL _: URL,
        operationID _: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        lastRequest = request
        var response = HTTPResponse(status: .notFound)
        response.headerFields[.contentType] = "application/problem+json"
        let problem = #"{"type":"about:blank","title":"Not Found","status":404,"detail":"x","code":"profile_not_found"}"#
        return (response, HTTPBody(problem))
    }
}

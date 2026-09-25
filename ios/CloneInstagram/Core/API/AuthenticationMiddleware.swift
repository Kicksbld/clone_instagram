import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Ajoute `Authorization: Bearer <JWT Supabase>` à chaque appel de l'API (ADR-003).
/// Sans session, la requête part sans en-tête et l'API répond `401`.
nonisolated struct AuthenticationMiddleware: ClientMiddleware {
    let accessToken: @Sendable () async -> String?

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID _: String,
        next: @concurrent @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = await accessToken() {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}

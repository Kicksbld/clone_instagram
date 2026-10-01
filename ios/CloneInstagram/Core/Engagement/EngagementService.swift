import APIClient
import Foundation
import OpenAPIRuntime

nonisolated enum EngagementServiceError: Error, Equatable {
    /// Post inexistant, supprimé ou invisible pour moi (`404 post_not_found`, ADR-006).
    case postNotFound
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// `429 rate_limited` ; `retryAfter` en secondes (`Retry-After`).
    case rateLimited(retryAfter: Int?)
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// Entrée refusée par l'API (`400`).
    case invalidInput
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Likes des posts (module `engagement` de l'API) ; partagé par les features Feed et Post.
protocol EngagementService: Sendable {
    /// `PUT /v1/posts/{id}/like` : idempotent.
    func like(postId: String) async throws(EngagementServiceError) -> LikeStatus
    /// `DELETE /v1/posts/{id}/like` : idempotent.
    func unlike(postId: String) async throws(EngagementServiceError) -> LikeStatus
}

/// `EngagementService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APIEngagementService: EngagementService {
    let client: any APIProtocol

    func like(postId: String) async throws(EngagementServiceError) -> LikeStatus {
        let output = try await call { try await client.likePost(path: .init(id: postId)) }
        switch output {
        case let .ok(response):
            return try LikeStatus(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .tooManyRequests(response):
            throw .rateLimited(retryAfter: response.headers.retryAfter)
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func unlike(postId: String) async throws(EngagementServiceError) -> LikeStatus {
        let output = try await call { try await client.unlikePost(path: .init(id: postId)) }
        switch output {
        case let .ok(response):
            return try LikeStatus(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .tooManyRequests(response):
            throw .rateLimited(retryAfter: response.headers.retryAfter)
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    /// Erreur réseau ou corps non conforme au contrat → `unreachable`.
    private func call<Output>(_ operation: () async throws -> Output) async throws(EngagementServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(EngagementServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(
        _ status: Int,
        _ problem: () throws -> Components.Schemas.ProblemDetails
    ) -> EngagementServiceError {
        switch (try? problem())?.code {
        case "post_not_found": .postNotFound
        case "profile_not_found": .profileNotFound
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableEngagementService: EngagementService {
    func like(postId _: String) async throws(EngagementServiceError) -> LikeStatus {
        throw .unreachable
    }

    func unlike(postId _: String) async throws(EngagementServiceError) -> LikeStatus {
        throw .unreachable
    }
}

private extension LikeStatus {
    init(_ dto: Components.Schemas.LikeStatus) {
        self.init(isLiked: dto.liked, likeCount: dto.likeCount)
    }
}

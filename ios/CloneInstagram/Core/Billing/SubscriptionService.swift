import APIClient
import Foundation
import OpenAPIRuntime

enum SubscriptionServiceError: Error, Equatable {
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// `429 rate_limited`.
    case rateLimited
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Plan Clone Plus vérifié par l'API (ADR-012) : seule source qui débloque un avantage.
protocol SubscriptionService: Sendable {
    /// `POST /v1/me/subscription/refresh` : après un achat, une restauration et au lancement.
    func refresh() async throws(SubscriptionServiceError) -> PlanStatus
}

/// `SubscriptionService` sur le client généré (ADR-003).
struct APISubscriptionService: SubscriptionService {
    let client: any APIProtocol

    func refresh() async throws(SubscriptionServiceError) -> PlanStatus {
        let output: Operations.RefreshSubscription.Output
        do {
            output = try await client.refreshSubscription()
        } catch {
            throw .unreachable
        }
        switch output {
        case let .ok(response):
            guard let body = try? response.body.json else { throw .unexpectedResponse(statusCode: 200) }
            return PlanStatus(plan: Plan(body.plan), expiresAt: body.expiresAt)
        case .unauthorized:
            throw .unauthenticated
        case .notFound:
            throw .profileNotFound
        case .tooManyRequests:
            throw .rateLimited
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableSubscriptionService: SubscriptionService {
    func refresh() async throws(SubscriptionServiceError) -> PlanStatus {
        throw .unreachable
    }
}

import APIClient
import Foundation
import OpenAPIRuntime

/// Motif d'un signalement, dans l'ordre de la liste d'Instagram.
enum ReportReason: CaseIterable, Identifiable {
    case spam
    case nudity
    case harassment
    case violence
    case hate
    case other

    var id: Self {
        self
    }

    var title: String {
        switch self {
        case .spam: "Spam"
        case .nudity: "Nudité ou activité sexuelle"
        case .harassment: "Harcèlement ou intimidation"
        case .violence: "Violence ou organisations dangereuses"
        case .hate: "Propos ou symboles haineux"
        case .other: "Autre chose"
        }
    }
}

nonisolated enum ReportServiceError: Error, Equatable {
    /// Contenu ou compte inexistant, supprimé ou invisible pour moi (`404 post_not_found`,
    /// `comment_not_found` ou `user_not_found`, ADR-006).
    case targetNotFound
    /// Mon propre compte ou contenu (`422 cannot_report_self`).
    case cannotReportSelf
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// `429 rate_limited` (10 signalements par heure) ; `retryAfter` en secondes.
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

/// Signalements (module `moderation` de l'API), propres à la feature Report.
protocol ReportService: Sendable {
    /// `POST /v1/reports` ; `details` : précisions facultatives (500 caractères au plus).
    func report(_ target: ReportRoute.Target, reason: ReportReason, details: String?) async throws(ReportServiceError)
}

/// `ReportService` sur le client généré (ADR-003) : convertit le modèle et les erreurs.
struct APIReportService: ReportService {
    let client: any APIProtocol

    func report(_ target: ReportRoute.Target, reason: ReportReason, details: String?) async throws(ReportServiceError) {
        let (targetType, targetId): (Components.Schemas.ReportTargetType, String) = switch target {
        case let .post(id): (.post, id)
        case let .comment(id): (.comment, id)
        case let .user(id): (.user, id)
        }
        let request = Components.Schemas.CreateReportRequest(
            targetType: targetType,
            targetId: targetId,
            reason: Components.Schemas.ReportReason(reason),
            details: details
        )
        let output = try await call { try await client.createReport(body: .json(request)) }
        switch output {
        case .created:
            return
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .unprocessableContent(response):
            throw Self.error(422) { try response.body.applicationProblemJson }
        case let .tooManyRequests(response):
            throw .rateLimited(retryAfter: response.headers.retryAfter)
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    /// Erreur réseau ou corps non conforme au contrat → `unreachable`.
    private func call<Output>(_ operation: () async throws -> Output) async throws(ReportServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(
        _ status: Int,
        _ problem: () throws -> Components.Schemas.ProblemDetails
    ) -> ReportServiceError {
        switch (try? problem())?.code {
        case "post_not_found", "comment_not_found", "user_not_found": .targetNotFound
        case "cannot_report_self": .cannotReportSelf
        case "profile_not_found": .profileNotFound
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableReportService: ReportService {
    func report(_: ReportRoute.Target, reason _: ReportReason, details _: String?) async throws(ReportServiceError) {
        throw .unreachable
    }
}

private extension Components.Schemas.ReportReason {
    init(_ reason: ReportReason) {
        self = switch reason {
        case .spam: .spam
        case .nudity: .nudity
        case .harassment: .harassment
        case .violence: .violence
        case .hate: .hate
        case .other: .other
        }
    }
}

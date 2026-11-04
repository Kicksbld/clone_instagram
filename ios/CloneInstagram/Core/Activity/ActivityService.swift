import APIClient
import Foundation
import OpenAPIRuntime

nonisolated enum ActivityServiceError: Error, Equatable {
    /// Curseur de pagination refusé (`400 invalid_cursor`).
    case invalidCursor
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// Entrée refusée par l'API (`400`).
    case invalidInput
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Activité (notifications in-app, ADR-026) ; partagée par la pastille du cœur et la feature Activity.
protocol ActivityService: Sendable {
    /// `GET /v1/activity` ; `cursor` = `nextCursor` de la page précédente.
    func fetchActivity(cursor: String?) async throws(ActivityServiceError) -> ActivityPage
    /// `POST /v1/activity/read` : idempotent.
    func markAllRead() async throws(ActivityServiceError)
}

/// `ActivityService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APIActivityService: ActivityService {
    let client: any APIProtocol

    func fetchActivity(cursor: String?) async throws(ActivityServiceError) -> ActivityPage {
        let output = try await call { try await client.getActivity(query: .init(cursor: cursor)) }
        switch output {
        case let .ok(response):
            return try ActivityPage(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func markAllRead() async throws(ActivityServiceError) {
        let output = try await call { try await client.markActivityRead() }
        switch output {
        case .noContent:
            return
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    /// Erreur réseau, annulation ou corps non conforme au contrat → `unreachable`.
    private func call<Output>(_ operation: () async throws -> Output) async throws(ActivityServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(ActivityServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(_ status: Int, _ problem: () throws -> Components.Schemas.ProblemDetails) -> ActivityServiceError {
        switch (try? problem())?.code {
        case "invalid_cursor": .invalidCursor
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide : l'app affiche une erreur au lieu de planter.
struct UnavailableActivityService: ActivityService {
    func fetchActivity(cursor _: String?) async throws(ActivityServiceError) -> ActivityPage {
        throw .unreachable
    }

    func markAllRead() async throws(ActivityServiceError) {
        throw .unreachable
    }
}

private extension ActivityPage {
    init(_ dto: Components.Schemas.ActivityPage) {
        self.init(
            items: dto.items.compactMap(ActivityGroup.init),
            nextCursor: dto.nextCursor,
            unreadCount: dto.unreadCount
        )
    }
}

private extension ActivityGroup {
    /// `nil` pour un type que l'app ne connaît pas encore (liste ouverte, ADR-019).
    init?(_ dto: Components.Schemas.ActivityGroup) {
        let kind: Kind
        switch dto._type {
        case "like": kind = .like
        case "comment": kind = .comment
        case "comment_reply": kind = .commentReply
        case "follow": kind = .follow
        case "follow_request": kind = .followRequest
        case "mention": kind = .mention
        case "follow_accepted": kind = .followAccepted
        default: return nil
        }
        self.init(
            id: dto.id,
            kind: kind,
            actor: PostAuthor(
                id: dto.actor.id,
                username: dto.actor.username,
                avatar: dto.actor.avatar.flatMap(ImageVariants.init)
            ),
            actorCount: dto.actorCount,
            createdAt: dto.createdAt,
            isRead: dto.read,
            post: dto.post.flatMap { post in
                ImageVariants(post.thumbnail).map { PostPreview(id: post.id, thumbnail: $0) }
            },
            comment: dto.comment.map { CommentPreview(id: $0.id, body: $0.body) }
        )
    }
}

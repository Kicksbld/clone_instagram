import APIClient
import Foundation
import OpenAPIRuntime

nonisolated enum CommentServiceError: Error, Equatable {
    /// Post inexistant, supprimé ou invisible pour moi (`404 post_not_found`, ADR-006).
    case postNotFound
    /// Commentaire inexistant, supprimé ou invisible, ou que je ne peux pas supprimer (`404 comment_not_found`).
    case commentNotFound
    /// Réponse à une réponse (`422 reply_to_reply`).
    case replyToReply
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// `429 rate_limited` ; `retryAfter` en secondes (`Retry-After`).
    case rateLimited(retryAfter: Int?)
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

/// Commentaires des posts (module `engagement` de l'API), propres à la feature Comments.
protocol CommentService: Sendable {
    /// `GET /v1/posts/{id}/comments` : premier niveau, du plus récent au plus ancien, par pages de 20.
    func listComments(postId: String, cursor: String?) async throws(CommentServiceError) -> CommentPage
    /// `GET /v1/comments/{id}/replies` : du plus récent au plus ancien, par pages de 20.
    func listReplies(commentId: String, cursor: String?) async throws(CommentServiceError) -> CommentPage
    /// `POST /v1/posts/{id}/comments` ; `parentId` : commentaire de premier niveau auquel je réponds.
    func createComment(postId: String, body: String, parentId: String?) async throws(CommentServiceError) -> Comment
    /// `DELETE /v1/comments/{id}` : supprime aussi ses réponses ; déjà supprimé → `commentNotFound`.
    func deleteComment(id: String) async throws(CommentServiceError)
}

/// `CommentService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APICommentService: CommentService {
    let client: any APIProtocol

    func listComments(postId: String, cursor: String?) async throws(CommentServiceError) -> CommentPage {
        let output = try await call {
            try await client.listComments(path: .init(id: postId), query: .init(cursor: cursor))
        }
        switch output {
        case let .ok(response):
            return try CommentPage(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func listReplies(commentId: String, cursor: String?) async throws(CommentServiceError) -> CommentPage {
        let output = try await call {
            try await client.listReplies(path: .init(id: commentId), query: .init(cursor: cursor))
        }
        switch output {
        case let .ok(response):
            return try CommentPage(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func createComment(postId: String, body: String, parentId: String?) async throws(CommentServiceError) -> Comment {
        let request = Components.Schemas.CreateCommentRequest(body: body, parentId: parentId)
        let output = try await call {
            try await client.createComment(path: .init(id: postId), body: .json(request))
        }
        switch output {
        case let .created(response):
            return try Comment(Self.unwrap { try response.body.json })
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

    func deleteComment(id: String) async throws(CommentServiceError) {
        let output = try await call { try await client.deleteComment(path: .init(id: id)) }
        switch output {
        case .noContent:
            return
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    /// Erreur réseau ou corps non conforme au contrat → `unreachable`.
    private func call<Output>(_ operation: () async throws -> Output) async throws(CommentServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(CommentServiceError) -> Value {
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
    ) -> CommentServiceError {
        switch (try? problem())?.code {
        case "post_not_found": .postNotFound
        case "comment_not_found": .commentNotFound
        case "reply_to_reply": .replyToReply
        case "profile_not_found": .profileNotFound
        case "invalid_cursor": .invalidCursor
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableCommentService: CommentService {
    func listComments(postId _: String, cursor _: String?) async throws(CommentServiceError) -> CommentPage {
        throw .unreachable
    }

    func listReplies(commentId _: String, cursor _: String?) async throws(CommentServiceError) -> CommentPage {
        throw .unreachable
    }

    func createComment(postId _: String, body _: String, parentId _: String?) async throws(CommentServiceError) -> Comment {
        throw .unreachable
    }

    func deleteComment(id _: String) async throws(CommentServiceError) {
        throw .unreachable
    }
}

private extension CommentPage {
    init(_ dto: Components.Schemas.CommentPage) {
        self.init(items: dto.items.map(Comment.init), nextCursor: dto.nextCursor)
    }
}

private extension Comment {
    init(_ dto: Components.Schemas.Comment) {
        self.init(
            id: dto.id,
            postId: dto.postId,
            parentId: dto.parentId,
            author: PostAuthor(
                id: dto.author.id,
                username: dto.author.username,
                avatar: dto.author.avatar.flatMap(ImageVariants.init)
            ),
            body: dto.body,
            replyCount: dto.replyCount,
            createdAt: dto.createdAt,
            canDelete: dto.viewerCanDelete
        )
    }
}

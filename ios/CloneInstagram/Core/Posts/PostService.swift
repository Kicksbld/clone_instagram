import APIClient
import Foundation
import OpenAPIRuntime

nonisolated enum PostServiceError: Error, Equatable {
    /// Post inexistant, supprimé ou invisible pour moi (`404 post_not_found`, ADR-006).
    case postNotFound
    /// Compte inexistant ou invisible, ou privé non suivi (`404 user_not_found`).
    case userNotFound
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// `404 media_not_found`.
    case mediaNotFound
    /// `409 media_not_ready`.
    case mediaNotReady
    /// `409 media_already_attached` : le média sert déjà à un post (ex. publication déjà créée).
    case mediaAlreadyAttached
    /// `422 media_purpose_mismatch`.
    case mediaPurposeMismatch
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

/// Posts (module `posts` de l'API) ; partagé par la file de publication et les features Profile et Post.
protocol PostService: Sendable {
    /// `POST /v1/posts` : 1 à 10 images (carrousel), dans l'ordre d'affichage.
    func createPost(caption: String, mediaIds: [String]) async throws(PostServiceError) -> Post
    /// `GET /v1/posts/{id}`.
    func fetchPost(id: String) async throws(PostServiceError) -> Post
    /// `GET /v1/users/{id}/posts` ; `cursor` = `nextCursor` de la page précédente.
    func listPosts(of userId: String, cursor: String?) async throws(PostServiceError) -> PostPage
    /// `DELETE /v1/posts/{id}` : un de mes posts ; déjà supprimé ou d'un autre → `postNotFound`.
    func deletePost(id: String) async throws(PostServiceError)
}

/// `PostService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APIPostService: PostService {
    let client: any APIProtocol

    func createPost(caption: String, mediaIds: [String]) async throws(PostServiceError) -> Post {
        let body = Components.Schemas.CreatePostRequest(kind: .post, caption: caption, mediaIds: mediaIds)
        let output = try await call { try await client.createPost(body: .json(body)) }
        switch output {
        case let .created(response):
            return try Post(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .conflict(response):
            throw Self.error(409) { try response.body.applicationProblemJson }
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

    func fetchPost(id: String) async throws(PostServiceError) -> Post {
        let output = try await call { try await client.getPost(path: .init(id: id)) }
        switch output {
        case let .ok(response):
            return try Post(Self.unwrap { try response.body.json })
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

    func listPosts(of userId: String, cursor: String?) async throws(PostServiceError) -> PostPage {
        let output = try await call {
            try await client.listUserPosts(path: .init(id: userId), query: .init(cursor: cursor))
        }
        switch output {
        case let .ok(response):
            let page = try Self.unwrap { try response.body.json }
            return try PostPage(items: page.items.map(Post.init), nextCursor: page.nextCursor)
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

    func deletePost(id: String) async throws(PostServiceError) {
        let output = try await call { try await client.deletePost(path: .init(id: id)) }
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
    private func call<Output>(_ operation: () async throws -> Output) async throws(PostServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(PostServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(_ status: Int, _ problem: () throws -> Components.Schemas.ProblemDetails) -> PostServiceError {
        switch (try? problem())?.code {
        case "post_not_found": .postNotFound
        case "user_not_found": .userNotFound
        case "profile_not_found": .profileNotFound
        case "media_not_found": .mediaNotFound
        case "media_not_ready": .mediaNotReady
        case "media_already_attached": .mediaAlreadyAttached
        case "media_purpose_mismatch": .mediaPurposeMismatch
        case "invalid_cursor": .invalidCursor
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailablePostService: PostService {
    func createPost(caption _: String, mediaIds _: [String]) async throws(PostServiceError) -> Post {
        throw .unreachable
    }

    func fetchPost(id _: String) async throws(PostServiceError) -> Post {
        throw .unreachable
    }

    func listPosts(of _: String, cursor _: String?) async throws(PostServiceError) -> PostPage {
        throw .unreachable
    }

    func deletePost(id _: String) async throws(PostServiceError) {
        throw .unreachable
    }
}

private extension Post {
    init(_ dto: Components.Schemas.Post) throws(PostServiceError) {
        var media: [PostMediaItem] = []
        for item in dto.media {
            guard let variants = ImageVariants(item.variants) else { throw .unexpectedResponse(statusCode: 200) }
            media.append(PostMediaItem(variants: variants, width: item.width, height: item.height))
        }
        self.init(
            id: dto.id,
            caption: dto.caption,
            author: PostAuthor(
                id: dto.author.id,
                username: dto.author.username,
                avatar: dto.author.avatar.flatMap(ImageVariants.init)
            ),
            media: media,
            createdAt: dto.createdAt
        )
    }
}

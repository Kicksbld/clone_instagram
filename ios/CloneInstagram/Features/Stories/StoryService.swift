import APIClient
import Foundation
import OpenAPIRuntime

nonisolated enum StoryServiceError: Error, Equatable {
    /// Story supprimée, expirée ou invisible pour moi (`404 story_not_found`, ADR-006).
    case plusRequired
    case storyNotFound
    /// Auteur inexistant ou invisible (`404 user_not_found`).
    case userNotFound
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// Photo refusée : introuvable, pas prête, déjà utilisée ou d'un autre usage (`404` / `409` / `422 media_*`).
    case mediaRejected
    /// `429 rate_limited` : 20 stories par heure.
    case rateLimited
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// Entrée refusée par l'API (`400`).
    case invalidInput
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Stories (module `ephemeral` de l'API, ADR-025).
protocol StoryService: Sendable {
    /// `POST /v1/stories` : photo `ready` de `purpose` `story`.
    func publish(mediaId: String, audience: StoryAudience) async throws(StoryServiceError) -> Story
    /// `GET /v1/stories/tray` : dans l'ordre du bandeau.
    func tray() async throws(StoryServiceError) -> [StoryTrayItem]
    /// `GET /v1/users/{id}/stories` : de la plus ancienne à la plus récente.
    func stories(of userId: String) async throws(StoryServiceError) -> [Story]
    /// `POST /v1/stories/{id}/view` : idempotent.
    func markViewed(storyId: String, anonymous: Bool) async throws(StoryServiceError)
    func viewers(storyId: String, cursor: String?, query: String?) async throws(StoryServiceError) -> StoryViewerPage
    func archive(cursor: String?) async throws(StoryServiceError) -> ArchivedStoryPage
    /// `DELETE /v1/stories/{id}` : une de mes stories.
    func delete(storyId: String) async throws(StoryServiceError)
}

/// `StoryService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APIStoryService: StoryService {
    let client: any APIProtocol

    func publish(mediaId: String, audience: StoryAudience) async throws(StoryServiceError) -> Story {
        let body = Components.Schemas.CreateStoryRequest(
            mediaId: mediaId,
            audience: audience == .closeFriends ? .closeFriends : .everyone
        )
        let output = try await call { try await client.createStory(body: .json(body)) }
        switch output {
        case let .created(response):
            return try Story(Self.unwrap { try response.body.json })
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
        case .tooManyRequests:
            throw .rateLimited
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func tray() async throws(StoryServiceError) -> [StoryTrayItem] {
        let output = try await call { try await client.getStoryTray() }
        switch output {
        case let .ok(response):
            return try Self.unwrap { try response.body.json }.items.map(StoryTrayItem.init)
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func stories(of userId: String) async throws(StoryServiceError) -> [Story] {
        let output = try await call { try await client.listUserStories(path: .init(id: userId)) }
        switch output {
        case let .ok(response):
            return try Self.unwrap { try response.body.json }.items.map(Story.init)
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

    func markViewed(storyId: String, anonymous: Bool) async throws(StoryServiceError) {
        let output = try await call {
            try await client.viewStory(path: .init(id: storyId), body: .json(.init(anonymous: anonymous)))
        }
        switch output {
        case .noContent:
            return
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .forbidden(response):
            throw Self.error(403) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func viewers(storyId: String, cursor: String?, query: String?) async throws(StoryServiceError) -> StoryViewerPage {
        let output = try await call {
            try await client.listStoryViewers(path: .init(id: storyId), query: .init(q: query, cursor: cursor))
        }
        switch output {
        case let .ok(response):
            let page = try Self.unwrap { try response.body.json }
            return StoryViewerPage(items: page.items.map {
                StoryViewer(
                    account: PostAuthor(
                        id: $0.viewer.id,
                        username: $0.viewer.username,
                        avatar: $0.viewer.avatar.flatMap(ImageVariants.init)
                    ),
                    fullName: $0.viewer.fullName,
                    viewedAt: $0.viewedAt
                )
            }, nextCursor: page.nextCursor)
        case let .badRequest(response): throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response): throw Self.error(401) { try response.body.applicationProblemJson }
        case let .forbidden(response): throw Self.error(403) { try response.body.applicationProblemJson }
        case let .notFound(response): throw Self.error(404) { try response.body.applicationProblemJson }
        case .internalServerError: throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(status, _): throw .unexpectedResponse(statusCode: status)
        }
    }

    func archive(cursor: String?) async throws(StoryServiceError) -> ArchivedStoryPage {
        let output = try await call { try await client.listArchivedStories(query: .init(cursor: cursor)) }
        switch output {
        case let .ok(response):
            let page = try Self.unwrap { try response.body.json }
            return try ArchivedStoryPage(items: page.items.map(Story.init), nextCursor: page.nextCursor)
        case let .badRequest(response): throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response): throw Self.error(401) { try response.body.applicationProblemJson }
        case .internalServerError: throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(status, _): throw .unexpectedResponse(statusCode: status)
        }
    }

    func delete(storyId: String) async throws(StoryServiceError) {
        let output = try await call { try await client.deleteStory(path: .init(id: storyId)) }
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
    private func call<Output>(_ operation: () async throws -> Output) async throws(StoryServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(StoryServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(_ status: Int, _ problem: () throws -> Components.Schemas.ProblemDetails) -> StoryServiceError {
        switch (try? problem())?.code {
        case "plus_required": .plusRequired
        case "story_not_found": .storyNotFound
        case "user_not_found": .userNotFound
        case "profile_not_found": .profileNotFound
        case "media_not_found", "media_not_ready", "media_already_attached", "media_kind_mismatch",
             "media_purpose_mismatch": .mediaRejected
        case "unauthenticated": .unauthenticated
        case "validation_failed", "invalid_cursor": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableStoryService: StoryService {
    func publish(mediaId _: String, audience _: StoryAudience) async throws(StoryServiceError) -> Story {
        throw .unreachable
    }

    func tray() async throws(StoryServiceError) -> [StoryTrayItem] {
        throw .unreachable
    }

    func stories(of _: String) async throws(StoryServiceError) -> [Story] {
        throw .unreachable
    }

    func markViewed(storyId _: String, anonymous _: Bool) async throws(StoryServiceError) {
        throw .unreachable
    }

    func viewers(storyId _: String, cursor _: String?, query _: String?) async throws(StoryServiceError) -> StoryViewerPage {
        throw .unreachable
    }

    func archive(cursor _: String?) async throws(StoryServiceError) -> ArchivedStoryPage {
        throw .unreachable
    }

    func delete(storyId _: String) async throws(StoryServiceError) {
        throw .unreachable
    }
}

private extension PostAuthor {
    init(_ dto: Components.Schemas.PostAuthor) {
        self.init(id: dto.id, username: dto.username, avatar: dto.avatar.flatMap(ImageVariants.init))
    }
}

private extension Story {
    init(_ dto: Components.Schemas.Story) throws(StoryServiceError) {
        guard let variants = ImageVariants(dto.media.variants) else { throw .unexpectedResponse(statusCode: 200) }
        self.init(
            id: dto.id,
            author: PostAuthor(dto.author),
            audience: dto.audience == .closeFriends ? .closeFriends : .everyone,
            photo: PostMediaItem(variants: variants, width: dto.media.width, height: dto.media.height),
            isSeen: dto.viewerHasSeen,
            createdAt: dto.createdAt,
            expiresAt: dto.expiresAt
        )
    }
}

private extension StoryTrayItem {
    init(_ dto: Components.Schemas.StoryTrayItem) {
        self.init(
            author: PostAuthor(dto.author),
            isSeen: dto.seen,
            hasCloseFriendsStory: dto.hasCloseFriendsStory,
            latestStoryAt: dto.latestStoryAt
        )
    }
}

extension StoryService {
    func markViewed(storyId: String) async throws(StoryServiceError) {
        try await markViewed(storyId: storyId, anonymous: false)
    }
}

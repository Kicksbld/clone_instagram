import APIClient
import Foundation
import OpenAPIRuntime

enum SocialServiceError: Error, Equatable {
    /// Compte inexistant ou invisible pour moi (`404 user_not_found`, ADR-006).
    case userNotFound
    /// Compte privé : il ne peut pas encore être suivi (`403 account_private`, demandes en P1).
    case accountPrivate
    /// `422 cannot_follow_self`.
    case cannotFollowSelf
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
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

/// Abonnements, listes d'abonnés et recherche d'utilisateurs (ADR-006) ; partagé par les features
/// Profile et Search.
protocol SocialService: Sendable {
    /// `PUT /v1/users/{id}/follow`.
    func follow(userId: String) async throws(SocialServiceError) -> FollowStatus
    /// `DELETE /v1/users/{id}/follow`.
    func unfollow(userId: String) async throws(SocialServiceError) -> FollowStatus
    /// `GET /v1/users/{id}/followers` ou `/following` ; `cursor` = `nextCursor` de la page précédente.
    func list(_ kind: FollowListKind, of userId: String, cursor: String?) async throws(SocialServiceError) -> UserPage
    /// `GET /v1/search/users?q=`.
    func searchUsers(_ query: String) async throws(SocialServiceError) -> [UserSummary]
}

/// `SocialService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APISocialService: SocialService {
    let client: any APIProtocol

    func follow(userId: String) async throws(SocialServiceError) -> FollowStatus {
        let output = try await call { try await client.followUser(path: .init(id: userId)) }
        switch output {
        case let .ok(response):
            return try FollowStatus(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .forbidden(response):
            throw Self.error(403) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .unprocessableContent(response):
            throw Self.error(422) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func unfollow(userId: String) async throws(SocialServiceError) -> FollowStatus {
        let output = try await call { try await client.unfollowUser(path: .init(id: userId)) }
        switch output {
        case let .ok(response):
            return try FollowStatus(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .unprocessableContent(response):
            throw Self.error(422) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func list(_ kind: FollowListKind, of userId: String, cursor: String?) async throws(SocialServiceError) -> UserPage {
        switch kind {
        case .followers:
            let output = try await call {
                try await client.listFollowers(path: .init(id: userId), query: .init(cursor: cursor))
            }
            switch output {
            case let .ok(response):
                return try UserPage(Self.unwrap { try response.body.json })
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
        case .following:
            let output = try await call {
                try await client.listFollowing(path: .init(id: userId), query: .init(cursor: cursor))
            }
            switch output {
            case let .ok(response):
                return try UserPage(Self.unwrap { try response.body.json })
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
    }

    func searchUsers(_ query: String) async throws(SocialServiceError) -> [UserSummary] {
        let output = try await call { try await client.searchUsers(query: .init(q: query)) }
        switch output {
        case let .ok(response):
            return try Self.unwrap { try response.body.json }.items.map(UserSummary.init)
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

    /// Erreur réseau, annulation ou corps non conforme au contrat → `unreachable`.
    private func call<Output>(_ operation: () async throws -> Output) async throws(SocialServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(SocialServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(_ status: Int, _ problem: () throws -> Components.Schemas.ProblemDetails) -> SocialServiceError {
        switch (try? problem())?.code {
        case "user_not_found": .userNotFound
        case "account_private": .accountPrivate
        case "cannot_follow_self": .cannotFollowSelf
        case "profile_not_found": .profileNotFound
        case "invalid_cursor": .invalidCursor
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide : l'app affiche une erreur au lieu de planter.
struct UnavailableSocialService: SocialService {
    func follow(userId _: String) async throws(SocialServiceError) -> FollowStatus {
        throw .unreachable
    }

    func unfollow(userId _: String) async throws(SocialServiceError) -> FollowStatus {
        throw .unreachable
    }

    func list(_: FollowListKind, of _: String, cursor _: String?) async throws(SocialServiceError) -> UserPage {
        throw .unreachable
    }

    func searchUsers(_: String) async throws(SocialServiceError) -> [UserSummary] {
        throw .unreachable
    }
}

private extension FollowStatus {
    init(_ dto: Components.Schemas.FollowStatus) {
        self.init(isFollowing: dto.following, followerCount: dto.followerCount)
    }
}

private extension UserPage {
    init(_ dto: Components.Schemas.UserPage) {
        self.init(items: dto.items.map(UserSummary.init), nextCursor: dto.nextCursor)
    }
}

private extension UserSummary {
    init(_ dto: Components.Schemas.UserSummary) {
        self.init(
            id: dto.id,
            username: dto.username,
            fullName: dto.fullName,
            isPrivate: dto.isPrivate,
            avatar: dto.avatar.flatMap(ImageVariants.init),
            isFollowing: dto.relationship.following,
            followsMe: dto.relationship.followedBy
        )
    }
}

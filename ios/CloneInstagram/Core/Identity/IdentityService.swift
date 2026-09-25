import APIClient
import Foundation
import OpenAPIRuntime

enum IdentityServiceError: Error, Equatable {
    /// Onboarding non terminé (`404 profile_not_found`).
    case profileNotFound
    /// Profil inexistant ou invisible pour moi (`404 user_not_found`, ADR-006).
    case userNotFound
    /// `409 username_taken`.
    case usernameTaken
    /// `409 profile_already_exists`.
    case profileAlreadyExists
    /// `422 age_requirement_not_met`.
    case ageRequirementNotMet
    /// Photo refusée : `media_not_found`, `media_not_ready`, `media_already_attached` ou `media_purpose_mismatch`.
    case mediaRejected
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// Entrée refusée par l'API (`400`).
    case invalidInput
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Modifications de mon profil ; seuls les champs renseignés sont envoyés.
struct ProfileChanges: Equatable {
    var username: String?
    var fullName: String?
    var bio: String?
    /// Nouvelle photo de profil : média `ready` renvoyé par l'`UploadManager`.
    var avatarMediaId: String?
}

/// Profil de l'utilisateur authentifié, onboarding (ADR-018) et profils des autres (ADR-006).
protocol IdentityService: Sendable {
    func fetchMe() async throws(IdentityServiceError) -> Profile
    func checkUsername(_ username: String) async throws(IdentityServiceError) -> UsernameAvailability
    func completeOnboarding(username: String, fullName: String, birthDate: BirthDate) async throws(IdentityServiceError) -> Profile
    func updateMe(_ changes: ProfileChanges) async throws(IdentityServiceError) -> Profile
    /// Retire ma photo de profil (`DELETE /v1/me/avatar`).
    func removeAvatar() async throws(IdentityServiceError) -> Profile
    /// Profil d'un autre utilisateur (`GET /v1/users/{username}`).
    func fetchUserProfile(username: String) async throws(IdentityServiceError) -> UserProfile
}

/// `IdentityService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APIIdentityService: IdentityService {
    let client: any APIProtocol

    func fetchMe() async throws(IdentityServiceError) -> Profile {
        let output = try await call { try await client.getMe() }
        switch output {
        case let .ok(response):
            return try Profile(Self.unwrap { try response.body.json })
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

    func checkUsername(_ username: String) async throws(IdentityServiceError) -> UsernameAvailability {
        let output = try await call { try await client.getUsernameAvailability(path: .init(username: username)) }
        switch output {
        case let .ok(response):
            let body = try Self.unwrap { try response.body.json }
            return UsernameAvailability(username: body.username, available: body.available, suggestions: body.suggestions)
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

    func completeOnboarding(
        username: String,
        fullName: String,
        birthDate: BirthDate
    ) async throws(IdentityServiceError) -> Profile {
        let body = Components.Schemas.CompleteOnboardingRequest(username: username, fullName: fullName, birthDate: birthDate.iso8601)
        let output = try await call { try await client.completeOnboarding(body: .json(body)) }
        switch output {
        case let .created(response):
            return try Profile(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .conflict(response):
            throw Self.error(409) { try response.body.applicationProblemJson }
        case let .unprocessableContent(response):
            throw Self.error(422) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func updateMe(_ changes: ProfileChanges) async throws(IdentityServiceError) -> Profile {
        let body = Components.Schemas.UpdateMeRequest(
            username: changes.username,
            fullName: changes.fullName,
            bio: changes.bio,
            avatarMediaId: changes.avatarMediaId
        )
        let output = try await call { try await client.updateMe(body: .json(body)) }
        switch output {
        case let .ok(response):
            return try Profile(Self.unwrap { try response.body.json })
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
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func removeAvatar() async throws(IdentityServiceError) -> Profile {
        let output = try await call { try await client.removeAvatar() }
        switch output {
        case let .ok(response):
            return try Profile(Self.unwrap { try response.body.json })
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

    func fetchUserProfile(username: String) async throws(IdentityServiceError) -> UserProfile {
        let output = try await call { try await client.getUserProfile(path: .init(username: username)) }
        switch output {
        case let .ok(response):
            return try UserProfile(Self.unwrap { try response.body.json })
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
    private func call<Output>(_ operation: () async throws -> Output) async throws(IdentityServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(IdentityServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(_ status: Int, _ problem: () throws -> Components.Schemas.ProblemDetails) -> IdentityServiceError {
        switch (try? problem())?.code {
        case "profile_not_found": .profileNotFound
        case "user_not_found": .userNotFound
        case "username_taken": .usernameTaken
        case "profile_already_exists": .profileAlreadyExists
        case "age_requirement_not_met": .ageRequirementNotMet
        case "media_not_found", "media_not_ready", "media_already_attached", "media_purpose_mismatch": .mediaRejected
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

private extension Profile {
    init(_ dto: Components.Schemas.Me) {
        self.init(
            id: dto.id,
            username: dto.username,
            fullName: dto.fullName,
            bio: dto.bio,
            isPrivate: dto.isPrivate,
            status: AccountStatus(dto.status),
            followerCount: dto.followerCount,
            followingCount: dto.followingCount,
            postCount: dto.postCount,
            avatar: dto.avatar.flatMap(ImageVariants.init)
        )
    }
}

private extension UserProfile {
    init(_ dto: Components.Schemas.UserProfile) {
        self.init(
            id: dto.id,
            username: dto.username,
            fullName: dto.fullName,
            bio: dto.bio,
            isPrivate: dto.isPrivate,
            followerCount: dto.followerCount,
            followingCount: dto.followingCount,
            postCount: dto.postCount,
            avatar: dto.avatar.flatMap(ImageVariants.init),
            isFollowing: dto.relationship.following,
            followsMe: dto.relationship.followedBy,
            canViewContent: dto.canViewContent
        )
    }
}

private extension AccountStatus {
    init(_ status: Components.Schemas.AccountStatus) {
        switch status {
        case .active: self = .active
        case .suspended: self = .suspended
        case .banned: self = .banned
        }
    }
}

import APIClient
import Foundation
import OpenAPIRuntime

/// Usage d'un média (ADR-008) : il ne peut être rattaché qu'à cet usage.
nonisolated enum MediaPurpose: Equatable {
    case avatar
    case post
}

/// Motif d'échec du traitement d'un média par le worker.
nonisolated enum MediaFailureReason: Equatable {
    /// Le fichier n'est pas une image JPEG ou PNG.
    case invalidImage
    /// Plus de 20 Mo.
    case fileTooLarge
    /// Échec du traitement après ses tentatives.
    case processingError
}

/// Statut d'un média (`pending_upload` → `uploaded` → `processing` → `ready` | `failed`).
nonisolated enum MediaStatus: Equatable {
    case pendingUpload
    case uploaded
    case processing
    case ready(ImageVariants)
    case failed(MediaFailureReason)
}

/// Intention d'upload : le fichier part directement vers `uploadURL` (URL présignée), jamais par l'API.
nonisolated struct UploadIntent: Equatable {
    let mediaId: String
    let uploadURL: URL
    let expiresAt: Date
}

nonisolated enum MediaServiceError: Error, Equatable {
    /// `404 media_not_found` : inexistant ou d'un autre utilisateur.
    case mediaNotFound
    /// `409 media_invalid_transition`.
    case invalidTransition
    /// `404 profile_not_found` : onboarding non terminé.
    case profileNotFound
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// Entrée refusée par l'API (`400`).
    case invalidInput
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Médias de l'utilisateur authentifié (module `media` de l'API, ADR-008).
protocol MediaService: Sendable {
    func requestUpload(purpose: MediaPurpose, mimeType: String, sizeBytes: Int) async throws(MediaServiceError) -> UploadIntent
    func completeUpload(mediaId: String) async throws(MediaServiceError) -> MediaStatus
    func fetchStatus(mediaId: String) async throws(MediaServiceError) -> MediaStatus
}

/// `MediaService` sur le client généré (ADR-003) : convertit DTO et erreurs en modèles de l'app.
struct APIMediaService: MediaService {
    let client: any APIProtocol

    func requestUpload(purpose: MediaPurpose, mimeType: String, sizeBytes: Int) async throws(MediaServiceError) -> UploadIntent {
        guard let mimeType = Components.Schemas.MediaUploadRequest.MimeTypePayload(rawValue: mimeType) else {
            throw .invalidInput
        }
        let body = Components.Schemas.MediaUploadRequest(
            kind: .image,
            purpose: Components.Schemas.MediaPurpose(purpose),
            mimeType: mimeType,
            sizeBytes: sizeBytes
        )
        let output = try await call { try await client.requestMediaUpload(body: .json(body)) }
        switch output {
        case let .created(response):
            let intent = try Self.unwrap { try response.body.json }
            guard let url = URL(string: intent.uploadUrl) else { throw .unexpectedResponse(statusCode: 201) }
            return UploadIntent(mediaId: intent.mediaId, uploadURL: url, expiresAt: intent.expiresAt)
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

    func completeUpload(mediaId: String) async throws(MediaServiceError) -> MediaStatus {
        let output = try await call { try await client.completeMediaUpload(path: .init(id: mediaId)) }
        switch output {
        case let .ok(response):
            return try MediaStatus(Self.unwrap { try response.body.json })
        case let .badRequest(response):
            throw Self.error(400) { try response.body.applicationProblemJson }
        case let .unauthorized(response):
            throw Self.error(401) { try response.body.applicationProblemJson }
        case let .notFound(response):
            throw Self.error(404) { try response.body.applicationProblemJson }
        case let .conflict(response):
            throw Self.error(409) { try response.body.applicationProblemJson }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }

    func fetchStatus(mediaId: String) async throws(MediaServiceError) -> MediaStatus {
        let output = try await call { try await client.getMedia(path: .init(id: mediaId)) }
        switch output {
        case let .ok(response):
            return try MediaStatus(Self.unwrap { try response.body.json })
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
    private func call<Output>(_ operation: () async throws -> Output) async throws(MediaServiceError) -> Output {
        do {
            return try await operation()
        } catch {
            throw .unreachable
        }
    }

    private static func unwrap<Value>(_ body: () throws -> Value) throws(MediaServiceError) -> Value {
        do {
            return try body()
        } catch {
            throw .unexpectedResponse(statusCode: 200)
        }
    }

    /// Erreur de l'app selon le `code` stable du Problem Details (ADR-003).
    private static func error(_ status: Int, _ problem: () throws -> Components.Schemas.ProblemDetails) -> MediaServiceError {
        switch (try? problem())?.code {
        case "media_not_found": .mediaNotFound
        case "media_invalid_transition": .invalidTransition
        case "profile_not_found": .profileNotFound
        case "unauthenticated": .unauthenticated
        case "validation_failed": .invalidInput
        default: .unexpectedResponse(statusCode: status)
        }
    }
}

private extension Components.Schemas.MediaPurpose {
    init(_ purpose: MediaPurpose) {
        switch purpose {
        case .avatar: self = .avatar
        case .post: self = .post
        }
    }
}

private extension MediaStatus {
    init(_ dto: Components.Schemas.Media) throws(MediaServiceError) {
        switch dto.status {
        case .pendingUpload:
            self = .pendingUpload
        case .uploaded:
            self = .uploaded
        case .processing:
            self = .processing
        case .ready:
            guard let variants = dto.variants.flatMap(ImageVariants.init) else {
                throw .unexpectedResponse(statusCode: 200)
            }
            self = .ready(variants)
        case .failed:
            self = .failed(MediaFailureReason(dto.failureReason))
        }
    }
}

private extension MediaFailureReason {
    init(_ reason: Components.Schemas.MediaFailureReason?) {
        switch reason {
        case .invalidImage: self = .invalidImage
        case .fileTooLarge: self = .fileTooLarge
        case .processingError, nil: self = .processingError
        }
    }
}

extension ImageVariants {
    /// `nil` si une URL du contrat n'est pas une URL valide.
    init?(_ dto: Components.Schemas.ImageVariants) {
        guard let thumb = URL(string: dto.thumb),
              let medium = URL(string: dto.medium),
              let large = URL(string: dto.large)
        else { return nil }
        self.init(thumb: thumb, medium: medium, large: large)
    }
}

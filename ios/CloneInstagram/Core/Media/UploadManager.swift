import Foundation

nonisolated enum UploadError: Error, Equatable {
    /// La photo choisie n'a pas pu être lue.
    case unreadableImage
    /// Envoi du fichier interrompu ou refusé.
    case transferFailed
    /// Traitement refusé par le worker (fichier invalide, trop lourd…).
    case rejected(MediaFailureReason)
    /// Traitement trop long.
    case timedOut
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Session expirée.
    case unauthenticated
    /// Réponse non prévue.
    case unexpected
}

/// Envoi d'une image jusqu'à un média `ready` (ADR-008), utilisé par les ViewModels.
protocol UploadService: Sendable {
    /// Identifiant du média prêt, à rattacher ensuite (`PATCH /v1/me`, posts en T6a).
    func uploadImage(_ data: Data, purpose: MediaPurpose) async throws(UploadError) -> String
}

/**
 `UploadManager` (ADR-008) : préparation (HEIC → JPEG sans métadonnées) → intention d'upload → envoi du
 fichier par `URLSession` background → `complete` → attente du traitement par `GET /v1/media/{id}`.
 La file persistée qui survit à la fermeture de l'app arrive en T6a.
 */
struct UploadManager: UploadService {
    typealias Prepare = @Sendable (Data) async throws(ImagePreparationError) -> PreparedImage

    let media: any MediaService
    let uploader: any FileUploader
    var prepare: Prepare = { data throws(ImagePreparationError) in try await ImagePreparer.prepare(data) }
    var pollInterval: Duration = .seconds(1)
    var timeout: Duration = .seconds(60)
    var sleep: @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }

    /// Limite d'ADR-008, vérifiée avant l'envoi (le worker la revérifie).
    static let maxSizeBytes = 20 * 1024 * 1024

    func uploadImage(_ data: Data, purpose: MediaPurpose) async throws(UploadError) -> String {
        let image: PreparedImage
        do {
            image = try await prepare(data)
        } catch {
            throw .unreadableImage
        }
        defer { try? FileManager.default.removeItem(at: image.fileURL) }
        guard image.sizeBytes <= Self.maxSizeBytes else { throw .rejected(.fileTooLarge) }

        do {
            let intent = try await media.requestUpload(purpose: purpose, mimeType: image.mimeType, sizeBytes: image.sizeBytes)
            do {
                try await uploader.upload(fileURL: image.fileURL, to: intent.uploadURL, contentType: image.mimeType)
            } catch {
                throw UploadError.transferFailed
            }
            let status = try await media.completeUpload(mediaId: intent.mediaId)
            try await waitUntilProcessed(mediaId: intent.mediaId, status: status)
            return intent.mediaId
        } catch let error as UploadError {
            throw error
        } catch let error as MediaServiceError {
            throw Self.uploadError(error)
        } catch {
            throw .unexpected
        }
    }

    /// Interroge le statut jusqu'à `ready` ou `failed` (P1 : événement WebSocket à la place).
    private func waitUntilProcessed(mediaId: String, status initial: MediaStatus) async throws {
        var status = initial
        var waited = Duration.zero
        while true {
            switch status {
            case .ready:
                return
            case let .failed(reason):
                throw UploadError.rejected(reason)
            case .pendingUpload, .uploaded, .processing:
                guard waited < timeout else { throw UploadError.timedOut }
                try await sleep(pollInterval)
                waited += pollInterval
                status = try await media.fetchStatus(mediaId: mediaId)
            }
        }
    }

    private static func uploadError(_ error: MediaServiceError) -> UploadError {
        switch error {
        case .unreachable: .unreachable
        case .unauthenticated: .unauthenticated
        case .mediaNotFound, .invalidTransition, .profileNotFound, .invalidInput, .unexpectedResponse: .unexpected
        }
    }
}

extension UploadError {
    /// Message compréhensible, sans détail technique (ADR-014) ; partagé par les écrans qui envoient une photo.
    static func message(for error: UploadError) -> String {
        switch error {
        case .unreadableImage: "Cette photo n'a pas pu être lue. Choisissez-en une autre."
        case .rejected(.invalidImage): "Ce fichier n'est pas une photo valide. Choisissez-en une autre."
        case .rejected(.fileTooLarge): "Cette photo est trop lourde. Choisissez-en une autre."
        case .rejected(.processingError): "La photo n'a pas pu être traitée. Réessayez."
        case .transferFailed: "L'envoi de la photo a échoué. Vérifiez votre connexion et réessayez."
        case .timedOut: "Le traitement de la photo prend trop de temps. Réessayez."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        case .unexpected: "Une erreur est survenue. Réessayez."
        }
    }
}

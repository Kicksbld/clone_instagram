import Foundation

nonisolated enum UploadError: Error, Equatable {
    /// La photo choisie n'a pas pu être lue.
    case unreadableImage
    /// Envoi du fichier interrompu (réseau).
    case transferFailed
    /// Fichier refusé par Storage (type ou taille non autorisés, URL expirée…) : la connexion n'y est pour rien.
    case storageRejected
    /// Traitement refusé par le worker (fichier invalide, trop lourd…).
    case rejected(MediaFailureReason)
    /// Traitement trop long.
    case timedOut
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Session expirée.
    case unauthenticated
    /// Trop de photos envoyées (`429`, limite d'ADR-005).
    case rateLimited
    /// Réponse non prévue.
    case unexpected
}

/// Envoi d'une image jusqu'à un média `ready` (ADR-008), utilisé par les ViewModels.
protocol UploadService: Sendable {
    /// Identifiant du média prêt, à rattacher ensuite (ex. `PATCH /v1/me`).
    func uploadImage(_ data: Data, purpose: MediaPurpose) async throws(UploadError) -> String
}

/// Étapes de l'envoi, reprises une à une par la file de publication (`PublishQueue`).
protocol MediaUploading: Sendable {
    /// Intention d'upload → envoi du fichier préparé → `complete` ; renvoie l'identifiant du média.
    func send(_ image: PreparedImage, purpose: MediaPurpose) async throws(UploadError) -> String
    /// Attend que le worker ait traité le média (`ready`), ou lève le refus.
    func waitUntilProcessed(mediaId: String, isVideo: Bool) async throws(UploadError)
}

/**
 `UploadManager` (ADR-008) : préparation (HEIC → JPEG sans métadonnées) → intention d'upload → envoi du
 fichier par `URLSession` background → `complete` → événement de fin de traitement, avec repli REST.
 La publication d'un post passe par `PublishQueue`, qui persiste chaque étape.
 */
struct UploadManager: UploadService, MediaUploading {
    typealias Prepare = @Sendable (Data) async throws(ImagePreparationError) -> PreparedImage

    let media: any MediaService
    let uploader: any FileUploader
    var prepare: Prepare = { data throws(ImagePreparationError) in try await ImagePreparer.prepare(data) }
    var processingEvents: MediaProcessingEvents?
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
        let mediaId = try await send(image, purpose: purpose)
        try await waitUntilProcessed(mediaId: mediaId)
        return mediaId
    }

    func send(_ image: PreparedImage, purpose: MediaPurpose) async throws(UploadError) -> String {
        guard image.sizeBytes <= (image.mimeType == "video/mp4" ? 50 * 1024 * 1024 : Self.maxSizeBytes)
        else { throw .rejected(.fileTooLarge) }
        do {
            let intent = try await media.requestUpload(purpose: purpose, mimeType: image.mimeType, sizeBytes: image.sizeBytes)
            do {
                try await uploader.upload(fileURL: image.fileURL, to: intent.uploadURL, contentType: image.mimeType)
            } catch {
                throw Self.uploadError(error)
            }
            _ = try await media.completeUpload(mediaId: intent.mediaId)
            return intent.mediaId
        } catch let error as UploadError {
            throw error
        } catch let error as MediaServiceError {
            throw Self.uploadError(error)
        } catch {
            throw .unexpected
        }
    }

    /// Attend le temps réel ; REST rattrape les événements perdus (ADR-022).
    func waitUntilProcessed(mediaId: String, isVideo: Bool) async throws(UploadError) {
        if let processingEvents {
            try await waitForEvents(mediaId: mediaId, events: processingEvents, isVideo: isVideo)
            return
        }
        var waited = Duration.zero
        do {
            while true {
                switch try await media.fetchStatus(mediaId: mediaId) {
                case .ready, .videoReady:
                    return
                case let .failed(reason):
                    throw UploadError.rejected(reason)
                case .pendingUpload, .uploaded, .processing:
                    guard waited < (isVideo ? .seconds(600) : timeout) else { throw UploadError.timedOut }
                    try await sleep(pollInterval)
                    waited += pollInterval
                }
            }
        } catch let error as UploadError {
            throw error
        } catch let error as MediaServiceError {
            throw Self.uploadError(error)
        } catch {
            throw .unexpected
        }
    }

    private func waitForEvents(mediaId: String, events: MediaProcessingEvents, isVideo: Bool) async throws(UploadError) {
        // Register before the initial read so a completion during that request cannot be lost.
        let subscription = events.signals(mediaId: mediaId, initialDelay: isVideo ? .seconds(120) : .seconds(20))
        defer { events.stop(subscription.id) }
        do {
            var status: MediaStatus = .processing
            do {
                status = try await media.fetchStatus(mediaId: mediaId)
            } catch .unreachable {
                // Offline: keep waiting; foreground, reconnection or the timer will retry.
            }
            switch status {
            case .ready, .videoReady: return
            case let .failed(reason): throw UploadError.rejected(reason)
            default: break
            }
            for await signal in subscription.stream {
                if Task.isCancelled {
                    throw UploadError.unexpected
                }
                switch signal {
                case let .status(value): status = value
                case .refresh:
                    do {
                        status = try await media.fetchStatus(mediaId: mediaId)
                    } catch .unreachable {
                        continue
                    }
                }
                switch status {
                case .ready, .videoReady: return
                case let .failed(reason): throw UploadError.rejected(reason)
                default: break
                }
            }
            throw UploadError.unexpected
        } catch let error as UploadError {
            throw error
        } catch let error as MediaServiceError {
            throw Self.uploadError(error)
        } catch {
            throw .unexpected
        }
    }

    /// Seule une coupure réseau parle de connexion ; un refus de Storage a son propre message.
    private static func uploadError(_ error: FileUploadError) -> UploadError {
        switch error {
        case .transferFailed: .transferFailed
        case .rejected(statusCode: 413): .rejected(.fileTooLarge)
        case .rejected: .storageRejected
        }
    }

    private static func uploadError(_ error: MediaServiceError) -> UploadError {
        switch error {
        case .unreachable: .unreachable
        case .unauthenticated: .unauthenticated
        case .rateLimited: .rateLimited
        case .mediaNotFound, .invalidTransition, .profileNotFound, .invalidInput, .unexpectedResponse: .unexpected
        }
    }
}

extension UploadError {
    /// Message compréhensible, sans détail technique (ADR-014) ; partagé par les écrans qui envoient une photo
    /// ou une vidéo (`isVideo` : reel).
    static func message(for error: UploadError, isVideo: Bool = false) -> String {
        let file = isVideo ? "la vidéo" : "la photo"
        return switch error {
        case .unreadableImage: "Cette photo n'a pas pu être lue. Choisissez-en une autre."
        case .rejected(.invalidVideo): "Cette vidéo est illisible. Choisissez-en une autre."
        case .rejected(.videoTooLong): "La vidéo dépasse 60 secondes. Choisissez-en une autre."
        case .rejected(.invalidImage): "Ce fichier n'est pas une photo valide. Choisissez-en une autre."
        case .rejected(.fileTooLarge): "Ce fichier est trop lourd. Choisissez-en une autre."
        case .rejected(.processingError): "Le fichier n'a pas pu être traité. Réessayez."
        case .transferFailed: "L'envoi de \(file) a échoué. Vérifiez votre connexion et réessayez."
        case .storageRejected: "Le serveur a refusé \(file). Réessayez plus tard."
        case .timedOut: "Le traitement de \(file) prend trop de temps. Réessayez."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        case .rateLimited: isVideo ? "Trop de vidéos envoyées. Réessayez plus tard." : "Trop de photos envoyées. Réessayez plus tard."
        case .unexpected: "Une erreur est survenue. Réessayez."
        }
    }
}

extension MediaUploading {
    func waitUntilProcessed(mediaId: String) async throws(UploadError) {
        try await waitUntilProcessed(mediaId: mediaId, isVideo: false)
    }
}

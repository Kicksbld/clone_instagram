import Foundation
import Observation

/// Nouvelle story (ADR-025) : photo de la caméra ou de la photothèque, audience, puis envoi par le
/// gestionnaire d'upload (attente de `media.ready`) et publication.
@Observable
final class CreateStoryViewModel {
    enum State: Equatable {
        case editing
        case sharing
        case failed(message: String)
        case published
    }

    private(set) var state: State = .editing
    /// Photo choisie, telle que lue par la vue.
    private(set) var photo: Data?
    var audience: StoryAudience = .everyone

    private let uploads: any UploadService
    private let service: any StoryService
    private let onPublished: () -> Void
    /// Photo déjà prête : « Réessayer » ne la renvoie pas.
    private var uploadedMediaId: String?

    init(uploads: any UploadService, service: any StoryService, onPublished: @escaping () -> Void = {}) {
        self.uploads = uploads
        self.service = service
        self.onPublished = onPublished
    }

    var canShare: Bool {
        photo != nil && state != .sharing
    }

    func select(_ data: Data) {
        photo = data
        uploadedMediaId = nil
        state = .editing
    }

    /// « Partager » ou « Réessayer ».
    func share() async {
        guard let photo, state != .sharing else { return }
        state = .sharing
        do {
            let mediaId: String
            if let uploadedMediaId {
                mediaId = uploadedMediaId
            } else {
                mediaId = try await uploads.uploadImage(photo, purpose: .story)
                uploadedMediaId = mediaId
            }
            _ = try await service.publish(mediaId: mediaId, audience: audience)
            state = .published
            onPublished()
        } catch let error as UploadError {
            state = .failed(message: UploadError.message(for: error))
        } catch let error as StoryServiceError {
            if error == .mediaRejected {
                uploadedMediaId = nil
            }
            state = .failed(message: Self.message(for: error))
        } catch {
            state = .failed(message: "Une erreur est survenue. Réessayez.")
        }
    }

    private static func message(for error: StoryServiceError) -> String {
        switch error {
        case .rateLimited: "Trop de stories publiées. Réessayez plus tard."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        case .mediaRejected: "Cette photo n'a pas pu être publiée. Réessayez."
        default: "Une erreur est survenue. Réessayez."
        }
    }
}

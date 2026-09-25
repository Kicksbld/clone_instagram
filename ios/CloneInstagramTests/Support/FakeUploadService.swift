import Foundation
@testable import CloneInstagram

/// Faux `UploadService` : média prêt renvoyé ou erreur programmée, envois enregistrés.
final class FakeUploadService: UploadService {
    var mediaId = "0199a1b2-0000-7000-9000-000000000001"
    var error: UploadError?
    private(set) var uploads: [(data: Data, purpose: MediaPurpose)] = []

    func uploadImage(_ data: Data, purpose: MediaPurpose) async throws(UploadError) -> String {
        uploads.append((data, purpose))
        if let error {
            throw error
        }
        return mediaId
    }
}

/// Faux `MediaService` : statuts successifs programmables, appels enregistrés.
final class FakeMediaService: MediaService {
    var intent = UploadIntent(
        mediaId: "0199a1b2-0000-7000-9000-000000000001",
        uploadURL: URL(filePath: "/storage/v1/object/upload/sign/uploads/photo"),
        expiresAt: Date(timeIntervalSince1970: 1_790_344_800)
    )
    var requestError: MediaServiceError?
    var completeStatus: MediaStatus = .uploaded
    /// Réponses successives de `GET /v1/media/{id}` ; la dernière est répétée.
    var statuses: [MediaStatus] = [.ready(.fixture)]

    struct Request: Equatable {
        let purpose: MediaPurpose
        let mimeType: String
        let sizeBytes: Int
    }

    private(set) var requests: [Request] = []
    private(set) var completed: [String] = []
    private(set) var statusRequests = 0

    func requestUpload(purpose: MediaPurpose, mimeType: String, sizeBytes: Int) async throws(MediaServiceError) -> UploadIntent {
        requests.append(Request(purpose: purpose, mimeType: mimeType, sizeBytes: sizeBytes))
        if let requestError {
            throw requestError
        }
        return intent
    }

    func completeUpload(mediaId: String) async throws(MediaServiceError) -> MediaStatus {
        completed.append(mediaId)
        return completeStatus
    }

    func fetchStatus(mediaId _: String) async throws(MediaServiceError) -> MediaStatus {
        statusRequests += 1
        return statuses.count > 1 ? statuses.removeFirst() : statuses[0]
    }
}

/// Faux envoi de fichier : réussit ou échoue, enregistre les fichiers envoyés.
final class FakeFileUploader: FileUploader {
    var error: FileUploadError?
    struct Upload: Equatable {
        let fileURL: URL
        let url: URL
        let contentType: String
    }

    private(set) var uploads: [Upload] = []
    /// Le fichier existait-il au moment de l'envoi (supprimé ensuite par l'UploadManager) ?
    private(set) var fileExistedDuringUpload = false

    func upload(fileURL: URL, to url: URL, contentType: String) async throws(FileUploadError) {
        uploads.append(Upload(fileURL: fileURL, url: url, contentType: contentType))
        fileExistedDuringUpload = FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false))
        if let error {
            throw error
        }
    }
}

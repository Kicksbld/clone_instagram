import Foundation
import Testing
@testable import CloneInstagram

struct UploadManagerTests {
    private let media = FakeMediaService()
    private let uploader = FakeFileUploader()
    private let directory = FileManager.default.temporaryDirectory.appending(path: "upload-manager-tests-\(UUID().uuidString)")

    private func makeManager(sizeBytes: Int = 2048, timeout: Duration = .seconds(60)) -> UploadManager {
        let directory = directory
        return UploadManager(
            media: media,
            uploader: uploader,
            prepare: { _ throws(ImagePreparationError) in
                // Fichier réel : l'UploadManager le supprime une fois l'envoi terminé.
                let url = directory.appending(path: "photo.jpg")
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    try Data("jpeg".utf8).write(to: url)
                } catch {
                    throw .writeFailed
                }
                return PreparedImage(fileURL: url, sizeBytes: sizeBytes, mimeType: "image/jpeg", width: 100, height: 100)
            },
            pollInterval: .seconds(1),
            timeout: timeout,
            sleep: { _ in }
        )
    }

    @Test func `intention → envoi du fichier → complete → attente du traitement → média prêt`() async throws {
        media.statuses = [.processing, .processing, .ready(.fixture)]

        let mediaId = try await makeManager().uploadImage(Data("photo".utf8), purpose: .avatar)

        #expect(mediaId == media.intent.mediaId)
        #expect(media.requests.map(\.purpose) == [.avatar])
        #expect(media.requests.map(\.mimeType) == ["image/jpeg"])
        #expect(media.requests.map(\.sizeBytes) == [2048])
        #expect(uploader.uploads.map(\.url) == [media.intent.uploadURL])
        #expect(uploader.uploads.map(\.contentType) == ["image/jpeg"])
        #expect(uploader.fileExistedDuringUpload)
        #expect(media.completed == [media.intent.mediaId])
        #expect(media.statusRequests == 3)
        // Fichier temporaire supprimé après l'envoi.
        let fileURL = try #require(uploader.uploads.first?.fileURL)
        #expect(!FileManager.default.fileExists(atPath: fileURL.path()))
    }

    @Test(arguments: [MediaFailureReason.invalidImage, .fileTooLarge, .processingError])
    func `traitement refusé par le worker → rejected`(reason: MediaFailureReason) async {
        media.statuses = [.failed(reason)]

        await #expect(throws: UploadError.rejected(reason)) {
            try await makeManager().uploadImage(Data("photo".utf8), purpose: .avatar)
        }
    }

    @Test func `traitement trop long → timedOut`() async {
        media.statuses = [.processing]

        await #expect(throws: UploadError.timedOut) {
            try await makeManager(timeout: .seconds(5)).uploadImage(Data("photo".utf8), purpose: .avatar)
        }
        // Un premier statut lu tout de suite, puis un par seconde pendant 5 s.
        #expect(media.statusRequests == 6)
    }

    @Test func `envoi du fichier en échec → transferFailed, sans complete`() async {
        uploader.error = .transferFailed

        await #expect(throws: UploadError.transferFailed) {
            try await makeManager().uploadImage(Data("photo".utf8), purpose: .avatar)
        }
        #expect(media.completed.isEmpty)
    }

    @Test func `API injoignable → unreachable, rien n'est envoyé`() async {
        media.requestError = .unreachable

        await #expect(throws: UploadError.unreachable) {
            try await makeManager().uploadImage(Data("photo".utf8), purpose: .avatar)
        }
        #expect(uploader.uploads.isEmpty)
    }

    @Test func `plus de 20 Mo après préparation → refusé avant l'envoi`() async {
        await #expect(throws: UploadError.rejected(.fileTooLarge)) {
            try await makeManager(sizeBytes: 20 * 1024 * 1024 + 1).uploadImage(Data("photo".utf8), purpose: .avatar)
        }
        #expect(media.requests.isEmpty)
    }

    @Test func `photo illisible → unreadableImage`() async {
        let manager = UploadManager(media: media, uploader: uploader, prepare: { _ throws(ImagePreparationError) in
            throw .unreadableImage
        })

        await #expect(throws: UploadError.unreadableImage) {
            try await manager.uploadImage(Data("photo".utf8), purpose: .avatar)
        }
    }
}

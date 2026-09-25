import Foundation
import Testing
@testable import CloneInstagram

struct PublishQueueTests {
    private static let authorId = "0199a1b2-5eed-7000-8000-000000000001"
    private let store = TemporaryPendingPostStore()
    private let uploads = FakeMediaUploading()
    private let posts = FakePostService()

    private func makeQueue() -> PublishQueue {
        PublishQueue(store: store, uploads: uploads, posts: posts) { _, directory throws(ImagePreparationError) in
            let url = directory.appending(path: "\(UUID().uuidString).jpg")
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try Data("jpeg".utf8).write(to: url)
            } catch {
                throw .writeFailed
            }
            return PreparedImage(fileURL: url, sizeBytes: 4, mimeType: "image/jpeg", width: 1080, height: 1440)
        }
    }

    private func publish(_ queue: PublishQueue, caption: String = "Salut", photos: Int = 1) async throws {
        let images = Array(repeating: Data("photo".utf8), count: photos)
        try await queue.publish(images: images, caption: caption, authorId: Self.authorId)
        await queue.waitUntilIdle()
    }

    private static func mediaId(_ number: Int) -> String {
        "0199a1b2-0000-7000-9000-00000000000\(number)"
    }

    @Test func `photo envoyée, traitée, puis post créé ; file vidée et fichier supprimé`() async throws {
        let queue = makeQueue()

        try await publish(queue)

        #expect(uploads.sent.map(\.purpose) == [.post])
        #expect(uploads.fileExistedDuringSend)
        #expect(uploads.waited == ["0199a1b2-0000-7000-9000-000000000001"])
        #expect(posts.created.map(\.caption) == ["Salut"])
        #expect(posts.created.map(\.mediaIds) == [[Self.mediaId(1)]])
        #expect(queue.items.isEmpty)
        #expect(queue.publishedCount == 1)
        #expect(store.load().isEmpty)
        let sentFile = try #require(uploads.sent.first?.image.fileURL)
        #expect(!FileManager.default.fileExists(atPath: sentFile.path(percentEncoded: false)))
    }

    @Test func `envoi en échec : publication gardée avec un message, puis Réessayer la termine`() async throws {
        uploads.sendErrors = [.transferFailed]
        let queue = makeQueue()

        try await publish(queue)

        let failed = try #require(queue.items.first)
        #expect(failed.failureMessage == UploadError.message(for: .transferFailed))
        #expect(failed.step == .upload)
        #expect(store.load() == queue.items)

        queue.retry(failed.id)
        await queue.waitUntilIdle()

        #expect(queue.items.isEmpty)
        #expect(posts.created.count == 1)
    }

    @Test func `média refusé par le worker : Réessayer repart d'un nouvel envoi`() async throws {
        uploads.waitErrors = [.rejected(.processingError)]
        let queue = makeQueue()

        try await publish(queue)
        let failed = try #require(queue.items.first)
        #expect(failed.step == .upload)

        queue.retry(failed.id)
        await queue.waitUntilIdle()

        #expect(uploads.sent.count == 2)
        #expect(posts.created.map(\.mediaIds) == [[Self.mediaId(2)]])
    }

    @Test func `traitement trop long : Réessayer reprend l'attente, sans renvoyer le fichier`() async throws {
        uploads.waitErrors = [.timedOut]
        let queue = makeQueue()

        try await publish(queue)
        let failed = try #require(queue.items.first)
        #expect(failed.step == .processing)

        queue.retry(failed.id)
        await queue.waitUntilIdle()

        #expect(uploads.sent.count == 1)
        #expect(uploads.waited.count == 2)
        #expect(queue.items.isEmpty)
    }

    @Test func `post déjà créé avant la fermeture de l'app (409 media_already_attached) : publication réussie`() async throws {
        posts.createResults = [.failure(.mediaAlreadyAttached)]
        let queue = makeQueue()

        try await publish(queue)

        #expect(queue.items.isEmpty)
        #expect(queue.publishedCount == 1)
    }

    @Test func `limite de publication atteinte : message avec le délai`() async throws {
        posts.createResults = [.failure(.rateLimited(retryAfter: 1200))]
        let queue = makeQueue()

        try await publish(queue)

        #expect(queue.items.first?.failureMessage == "Vous avez publié beaucoup de posts récemment. Réessayez dans 20 min.")
        #expect(queue.items.first?.step == .create)
    }

    @Test(arguments: [PendingPost.Step.upload, .processing, .create])
    func `relance de l'app : la publication reprend à l'étape enregistrée`(step: PendingPost.Step) async throws {
        let fileName = "photo.jpg"
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        try Data("jpeg".utf8).write(to: store.directory.appending(path: fileName))
        let media = PendingMedia(
            fileName: fileName,
            sizeBytes: 4,
            width: 1080,
            height: 1440,
            mediaId: step == .upload ? nil : "0199a1b2-0000-7000-9000-00000000000a"
        )
        store.save([PendingPost(id: UUID(), authorId: Self.authorId, caption: "Reprise", media: [media], step: step)])
        let queue = makeQueue()
        #expect(queue.items.count == 1)

        queue.resume(for: Self.authorId)
        await queue.waitUntilIdle()

        #expect(uploads.sent.count == (step == .upload ? 1 : 0))
        #expect(uploads.waited.count == (step == .create ? 0 : 1))
        #expect(posts.created.map(\.caption) == ["Reprise"])
        #expect(queue.items.isEmpty)
    }

    @Test func `relance avec un autre compte : la publication est abandonnée`() async {
        let media = PendingMedia(fileName: "x.jpg", sizeBytes: 4, width: 1, height: 1, mediaId: "0199a1b2-0000-7000-9000-00000000000a")
        store.save([PendingPost(id: UUID(), authorId: "autre", caption: "", media: [media], step: .create)])
        let queue = makeQueue()

        queue.resume(for: Self.authorId)
        await queue.waitUntilIdle()

        #expect(posts.created.isEmpty)
        #expect(queue.items.isEmpty)
        #expect(store.load().isEmpty)
    }

    @Test func `supprimer une publication en échec : retirée de la file, fichier supprimé`() async throws {
        uploads.sendErrors = [.unreachable]
        let queue = makeQueue()
        try await publish(queue)
        let failed = try #require(queue.items.first)

        queue.discard(failed.id)

        #expect(queue.items.isEmpty)
        #expect(store.load().isEmpty)
        let file = try #require(queue.fileURL(of: failed))
        #expect(!FileManager.default.fileExists(atPath: file.path(percentEncoded: false)))
    }

    @Test func `photo illisible : unreadableImage, rien n'est ajouté`() async {
        let queue = PublishQueue(store: store, uploads: uploads, posts: posts) { _, _ throws(ImagePreparationError) in
            throw .unreadableImage
        }

        await #expect(throws: UploadError.unreadableImage) {
            try await queue.publish(images: [Data()], caption: "", authorId: Self.authorId)
        }
        #expect(queue.items.isEmpty)
    }

    @Test func `carrousel de 3 photos : envoyées dans l'ordre, puis un seul post avec les 3 médias`() async throws {
        let queue = makeQueue()

        try await publish(queue, photos: 3)

        #expect(uploads.sent.count == 3)
        #expect(uploads.waited == [Self.mediaId(1), Self.mediaId(2), Self.mediaId(3)])
        #expect(posts.created.map(\.mediaIds) == [[Self.mediaId(1), Self.mediaId(2), Self.mediaId(3)]])
        #expect(queue.items.isEmpty)
        #expect(queue.publishedCount == 1)
    }

    @Test func `deuxième photo en échec : tout le post échoue, Réessayer n'envoie que les photos restantes`() async throws {
        let queue = makeQueue()
        uploads.failSend(at: 2, with: .transferFailed)

        try await publish(queue, photos: 3)

        let failed = try #require(queue.items.first)
        #expect(failed.failureMessage == UploadError.message(for: .transferFailed))
        #expect(failed.media.map(\.mediaId) == [Self.mediaId(1), nil, nil])
        #expect(posts.created.isEmpty)

        queue.retry(failed.id)
        await queue.waitUntilIdle()

        #expect(uploads.sent.count == 4)
        #expect(posts.created.map(\.mediaIds) == [[Self.mediaId(1), Self.mediaId(2), Self.mediaId(3)]])
        #expect(queue.items.isEmpty)
    }

    @Test func `photo refusée par le worker : Réessayer ne renvoie qu'elle`() async throws {
        let queue = makeQueue()
        uploads.failWait(at: 2, with: .rejected(.processingError))

        try await publish(queue, photos: 2)

        let failed = try #require(queue.items.first)
        #expect(failed.step == .upload)
        #expect(failed.media.map(\.mediaId) == [Self.mediaId(1), nil])

        queue.retry(failed.id)
        await queue.waitUntilIdle()

        #expect(uploads.sent.count == 3)
        #expect(posts.created.map(\.mediaIds) == [[Self.mediaId(1), Self.mediaId(3)]])
    }

    @Test func `supprimer un carrousel en échec : toutes ses photos locales sont supprimées`() async throws {
        let queue = makeQueue()
        uploads.failSend(at: 1, with: .unreachable)
        try await publish(queue, photos: 3)
        let failed = try #require(queue.items.first)

        queue.discard(failed.id)

        let files = try FileManager.default.contentsOfDirectory(atPath: store.directory.path(percentEncoded: false))
        #expect(files.filter { $0.hasSuffix(".jpg") }.isEmpty)
    }
}

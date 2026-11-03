import AVFoundation
import Foundation
import Testing
@testable import CloneInstagram

private final class ReelTestBundle: NSObject {}

struct ReelPublishingTests {
    @Test func `vidéo réencodée en MP4 puis envoyée et publiée comme reel`() async throws {
        let source = try #require(Bundle(for: ReelTestBundle.self).url(forResource: "reel-source", withExtension: "mp4"))
        let store = TemporaryPendingPostStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let prepared = try await VideoPreparer.prepare(source, in: store.directory)
        let asset = AVURLAsset(url: prepared.fileURL)
        let track = try #require(try await asset.loadTracks(withMediaType: .video).first)
        let actualSize = try await track.load(.naturalSize)
        #expect(actualSize.width == 1280)
        #expect(actualSize.height == 720)
        #expect(try await asset.load(.duration).seconds <= 2.1)
        try FileManager.default.removeItem(at: prepared.fileURL)
        let uploads = FakeMediaUploading()
        let posts = FakePostService()
        let queue = PublishQueue(store: store, uploads: uploads, posts: posts)
        try await queue.publish(video: source, caption: "Mon reel", authorId: "owner")
        await queue.waitUntilIdle()
        let sent = try #require(uploads.sent.first)
        #expect(sent.image.mimeType == "video/mp4")
        #expect(sent.image.width == 1280)
        #expect(sent.image.height == 720)
        #expect(sent.image.sizeBytes < 50 * 1024 * 1024)
        #expect(posts.createdReels == uploads.waited)
        #expect(queue.items.isEmpty)
    }

    @Test func `reel refusé par Storage → message sur la vidéo, sans parler de connexion`() async throws {
        let store = TemporaryPendingPostStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let pending = PendingPost(
            id: UUID(),
            authorId: "owner",
            caption: "Refus",
            kind: .reel,
            media: [PendingMedia(fileName: "reel.mp4", sizeBytes: 100, width: 720, height: 1280)],
            step: .upload
        )
        store.save([pending])
        let uploads = FakeMediaUploading()
        uploads.sendErrors = [.storageRejected]
        let queue = PublishQueue(store: store, uploads: uploads, posts: FakePostService())
        queue.resume(for: "owner")
        await queue.waitUntilIdle()
        let failed = try #require(queue.items.first)
        #expect(failed.failureMessage == "Le serveur a refusé la vidéo. Réessayez plus tard.")
        #expect(failed.step == .upload)
    }

    @Test func `reel en traitement repris après fermeture sans nouvel envoi`() async {
        let store = TemporaryPendingPostStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let pending = PendingPost(
            id: UUID(),
            authorId: "owner",
            caption: "Reprise",
            kind: .reel,
            media: [PendingMedia(fileName: "reel.mp4", sizeBytes: 100, width: 720, height: 1280, mediaId: "video")],
            step: .processing
        )
        store.save([pending])
        let uploads = FakeMediaUploading()
        let posts = FakePostService()
        let queue = PublishQueue(store: store, uploads: uploads, posts: posts)
        queue.resume(for: "owner")
        await queue.waitUntilIdle()
        #expect(uploads.sent.isEmpty)
        #expect(posts.createdReels == ["video"])
        #expect(queue.publishedCount == 1)
    }
}

private actor ExportGate {
    private var continuation: CheckedContinuation<PreparedImage, Never>?
    func prepare() async -> PreparedImage {
        await withCheckedContinuation { continuation = $0 }
    }

    func waitUntilStarted() async {
        while continuation == nil {
            await Task.yield()
        }
    }

    func finish(_ image: PreparedImage) {
        continuation?.resume(returning: image); continuation = nil
    }
}

extension ReelPublishingTests {
    @Test func `déconnexion pendant export → fichier abandonné et aucun envoi`() async throws {
        let store = TemporaryPendingPostStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        let file = store.directory.appending(path: "export.mp4")
        try Data("export".utf8).write(to: file)
        let gate = ExportGate()
        let uploads = FakeMediaUploading()
        let posts = FakePostService()
        let queue = PublishQueue(store: store, uploads: uploads, posts: posts, prepareVideo: { _, _ in await gate.prepare() })
        let publication = Task { try await queue.publish(video: file, caption: "", authorId: "ancien") }
        await gate.waitUntilStarted()
        queue.discardAll()
        await gate.finish(PreparedImage(fileURL: file, sizeBytes: 6, mimeType: "video/mp4", width: 720, height: 1280))
        await #expect(throws: UploadError.unauthenticated) { try await publication.value }
        #expect(queue.items.isEmpty)
        #expect(uploads.sent.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: file.path()))
    }
}

extension ReelPublishingTests {
    @Test func `une sélection vidéo lente ne remplace pas la dernière sélection`() async throws {
        let store = TemporaryPendingPostStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        let first = store.directory.appending(path: "first.mp4")
        let last = store.directory.appending(path: "last.mp4")
        try Data("first".utf8).write(to: first)
        try Data("last".utf8).write(to: last)
        let gate = ExportGate()
        let queue = PublishQueue(store: store, uploads: FakeMediaUploading(), posts: FakePostService())
        let viewModel = CreatePostViewModel(authorId: "owner", publisher: queue)
        viewModel.isReel = true
        let loading = Task { await viewModel.loadVideo { await gate.prepare().fileURL } }
        await gate.waitUntilStarted()
        #expect(!viewModel.canContinue)
        await viewModel.loadVideo { last }
        await gate.finish(PreparedImage(fileURL: first, sizeBytes: 5, mimeType: "video/mp4", width: 720, height: 1280))
        await loading.value
        #expect(viewModel.videoURL == last)
        #expect(viewModel.canContinue)
        #expect(!FileManager.default.fileExists(atPath: first.path()))
    }
}

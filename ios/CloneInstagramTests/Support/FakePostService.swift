import Foundation
@testable import CloneInstagram

/// Faux `PostService` : réponses programmables, requêtes enregistrées.
final class FakePostService: PostService {
    struct ListRequest: Equatable {
        let userId: String
        let cursor: String?
    }

    /// Réponses successives de `createPost` ; post créé quand la liste est vide.
    var createResults: [Result<Post, PostServiceError>] = []
    /// Réponses successives de `fetchPost` ; `.fixture()` quand la liste est vide.
    var fetchResults: [Result<Post, PostServiceError>] = []
    /// Réponses successives de `listPosts` ; page vide quand la liste est vide.
    var listResults: [Result<PostPage, PostServiceError>] = []

    private(set) var created: [(caption: String, mediaId: String)] = []
    private(set) var listRequests: [ListRequest] = []

    func createPost(caption: String, mediaId: String) async throws(PostServiceError) -> Post {
        created.append((caption, mediaId))
        guard !createResults.isEmpty else { return .fixture(caption: caption) }
        return try createResults.removeFirst().get()
    }

    func fetchPost(id: String) async throws(PostServiceError) -> Post {
        guard !fetchResults.isEmpty else { return .fixture(id: id) }
        return try fetchResults.removeFirst().get()
    }

    func listPosts(of userId: String, cursor: String?) async throws(PostServiceError) -> PostPage {
        listRequests.append(ListRequest(userId: userId, cursor: cursor))
        guard !listResults.isEmpty else { return PostPage(items: [], nextCursor: nil) }
        return try listResults.removeFirst().get()
    }
}

/// Faux envoi par étapes : identifiants de médias programmables, erreurs par étape.
final class FakeMediaUploading: MediaUploading {
    var mediaIds = ["0199a1b2-0000-7000-9000-000000000001", "0199a1b2-0000-7000-9000-000000000002"]
    var sendErrors: [UploadError] = []
    var waitErrors: [UploadError] = []
    private(set) var sent: [(image: PreparedImage, purpose: MediaPurpose)] = []
    private(set) var waited: [String] = []
    /// Le fichier préparé existait-il au moment de l'envoi ?
    private(set) var fileExistedDuringSend = false

    func send(_ image: PreparedImage, purpose: MediaPurpose) async throws(UploadError) -> String {
        sent.append((image, purpose))
        fileExistedDuringSend = FileManager.default.fileExists(atPath: image.fileURL.path())
        if !sendErrors.isEmpty {
            throw sendErrors.removeFirst()
        }
        return mediaIds.count > 1 ? mediaIds.removeFirst() : mediaIds[0]
    }

    func waitUntilProcessed(mediaId: String) async throws(UploadError) {
        waited.append(mediaId)
        if !waitErrors.isEmpty {
            throw waitErrors.removeFirst()
        }
    }
}

/// File enregistrée dans un dossier temporaire propre au test.
struct TemporaryPendingPostStore: PendingPostStore {
    let directory = FileManager.default.temporaryDirectory.appending(path: "publish-queue-tests-\(UUID().uuidString)")
    private var file: FilePendingPostStore {
        FilePendingPostStore(directory: directory)
    }

    func load() -> [PendingPost] {
        file.load()
    }

    func save(_ posts: [PendingPost]) {
        file.save(posts)
    }
}

extension Post {
    static func fixture(
        id: String = "0199a1b2-0000-7000-a000-000000000001",
        caption: String = "Coucher de soleil",
        authorId: String = "0199a1b2-5eed-7000-8000-000000000001"
    ) -> Post {
        Post(
            id: id,
            caption: caption,
            author: PostAuthor(id: authorId, username: "killian", avatar: nil),
            media: [PostMediaItem(variants: .fixture, width: 1080, height: 1440)],
            createdAt: Date(timeIntervalSince1970: 1_790_344_800)
        )
    }
}

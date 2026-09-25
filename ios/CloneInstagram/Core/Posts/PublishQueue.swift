import Foundation
import Observation

/// Publication en attente, persistée : elle survit à la fermeture de l'écran et de l'app (ADR-008).
nonisolated struct PendingPost: Codable, Equatable, Identifiable {
    /// Prochaine étape à exécuter ; chaque étape franchie est enregistrée avant la suivante.
    enum Step: String, Codable {
        /// Photo préparée : intention d'upload, envoi du fichier, `complete`.
        case upload
        /// Média envoyé : traitement par le worker.
        case processing
        /// Média prêt : création du post.
        case create
    }

    let id: UUID
    /// Profil qui publie : une publication n'est jamais reprise pour un autre compte.
    let authorId: String
    let caption: String
    /// Photo JPEG préparée (sans métadonnées), dans le dossier de la file.
    let fileName: String
    let sizeBytes: Int
    let width: Int
    let height: Int
    var step: Step
    var mediaId: String?
    /// Échec affiché dans le bandeau (« Réessayer », « Supprimer ») ; `nil` pendant la publication.
    var failureMessage: String?
}

/// Stockage de la file : état en JSON et photos préparées, dans un même dossier.
protocol PendingPostStore: Sendable {
    var directory: URL { get }
    func load() -> [PendingPost]
    func save(_ posts: [PendingPost])
}

/// File enregistrée dans Application Support (conservée d'un lancement à l'autre).
nonisolated struct FilePendingPostStore: PendingPostStore {
    let directory: URL

    static var applicationSupport: FilePendingPostStore {
        FilePendingPostStore(directory: URL.applicationSupportDirectory.appending(path: "PendingPosts", directoryHint: .isDirectory))
    }

    private var fileURL: URL {
        directory.appending(path: "queue.json")
    }

    func load() -> [PendingPost] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([PendingPost].self, from: data)) ?? []
    }

    func save(_ posts: [PendingPost]) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(posts).write(to: fileURL, options: .atomic)
        } catch {
            // Non bloquant : la publication continue, seule la reprise après fermeture serait perdue.
        }
    }
}

/// Publier une photo : utilisé par l'écran de création.
protocol PostPublishing: AnyObject {
    /// Prépare la photo et l'ajoute à la file ; la suite (envoi, traitement, création) continue sans l'écran.
    func publish(imageData: Data, caption: String, authorId: String) async throws(UploadError)
}

/**
 File de publication (ADR-008) : photo préparée → envoi → traitement → `POST /v1/posts`, chaque étape
 enregistrée. Au lancement, `resume` reprend là où la publication s'était arrêtée. Alimente le bandeau
 « Publication en cours » ; un échec y propose « Réessayer » ou « Supprimer ».
 */
@Observable
final class PublishQueue: PostPublishing {
    typealias Prepare = @Sendable (Data, URL) async throws(ImagePreparationError) -> PreparedImage

    private(set) var items: [PendingPost]
    /// Incrémenté à chaque post publié : grille et compteurs du profil se rechargent.
    private(set) var publishedCount = 0

    private let store: any PendingPostStore
    private let uploads: any MediaUploading
    private let posts: any PostService
    private let prepare: Prepare
    private var tasks: [UUID: Task<Void, Never>] = [:]

    init(
        store: any PendingPostStore,
        uploads: any MediaUploading,
        posts: any PostService,
        prepare: @escaping Prepare = { data, directory throws(ImagePreparationError) in
            try await ImagePreparer.prepare(data, in: directory)
        }
    ) {
        self.store = store
        self.uploads = uploads
        self.posts = posts
        self.prepare = prepare
        items = store.load()
    }

    func fileURL(of item: PendingPost) -> URL {
        store.directory.appending(path: item.fileName)
    }

    func publish(imageData: Data, caption: String, authorId: String) async throws(UploadError) {
        let image: PreparedImage
        do {
            image = try await prepare(imageData, store.directory)
        } catch {
            throw .unreadableImage
        }
        let item = PendingPost(
            id: UUID(),
            authorId: authorId,
            caption: caption,
            fileName: image.fileURL.lastPathComponent,
            sizeBytes: image.sizeBytes,
            width: image.width,
            height: image.height,
            step: .upload
        )
        items.append(item)
        persist()
        start(item.id)
    }

    /// Au lancement : reprend les publications de `authorId`, abandonne celles d'un autre compte.
    func resume(for authorId: String) {
        for item in items where item.authorId != authorId {
            discard(item.id)
        }
        for item in items where item.failureMessage == nil {
            start(item.id)
        }
    }

    func retry(_ id: UUID) {
        update(id) { $0.failureMessage = nil }
        start(id)
    }

    /// Abandonne la publication : photo locale supprimée ; un média déjà envoyé sera purgé (ADR-008).
    func discard(_ id: UUID) {
        tasks.removeValue(forKey: id)?.cancel()
        guard let item = items.first(where: { $0.id == id }) else { return }
        try? FileManager.default.removeItem(at: fileURL(of: item))
        items.removeAll { $0.id == id }
        persist()
    }

    /// À la déconnexion : rien n'est publié pour le compte suivant.
    func discardAll() {
        for item in items {
            discard(item.id)
        }
    }

    /// Attend la fin des publications en cours (tests).
    func waitUntilIdle() async {
        while let task = tasks.values.first {
            await task.value
        }
    }

    private func start(_ id: UUID) {
        guard tasks[id] == nil else { return }
        tasks[id] = Task { [weak self] in
            await self?.run(id)
            self?.tasks[id] = nil
        }
    }

    /// Exécute les étapes restantes jusqu'au post créé ou à un échec.
    private func run(_ id: UUID) async {
        while !Task.isCancelled, let item = items.first(where: { $0.id == id }), item.failureMessage == nil {
            switch item.step {
            case .upload:
                await upload(item)
            case .processing:
                await waitForProcessing(item)
            case .create:
                await create(item)
            }
        }
    }

    private func upload(_ item: PendingPost) async {
        let image = PreparedImage(
            fileURL: fileURL(of: item),
            sizeBytes: item.sizeBytes,
            mimeType: "image/jpeg",
            width: item.width,
            height: item.height
        )
        do {
            let mediaId = try await uploads.send(image, purpose: .post)
            update(item.id) {
                $0.mediaId = mediaId
                $0.step = .processing
            }
        } catch {
            fail(item.id, UploadError.message(for: error))
        }
    }

    private func waitForProcessing(_ item: PendingPost) async {
        guard let mediaId = item.mediaId else {
            update(item.id) { $0.step = .upload }
            return
        }
        do {
            try await uploads.waitUntilProcessed(mediaId: mediaId)
            update(item.id) { $0.step = .create }
        } catch {
            // Média refusé par le worker : « Réessayer » repart d'un nouvel envoi.
            if case .rejected = error {
                update(item.id) { $0.step = .upload }
            }
            fail(item.id, UploadError.message(for: error))
        }
    }

    private func create(_ item: PendingPost) async {
        guard let mediaId = item.mediaId else {
            update(item.id) { $0.step = .upload }
            return
        }
        do {
            _ = try await posts.createPost(caption: item.caption, mediaId: mediaId)
        } catch .mediaAlreadyAttached {
            // Le post a déjà été créé (réponse perdue avant la fermeture de l'app) : publication réussie.
        } catch .mediaNotReady {
            update(item.id) { $0.step = .processing }
            return
        } catch .mediaNotFound, .mediaPurposeMismatch {
            update(item.id) { $0.step = .upload }
            fail(item.id, Self.genericMessage)
            return
        } catch {
            fail(item.id, Self.message(for: error))
            return
        }
        finish(item.id)
    }

    private func finish(_ id: UUID) {
        discard(id)
        publishedCount += 1
    }

    private func fail(_ id: UUID, _ message: String) {
        update(id) { $0.failureMessage = message }
    }

    private func update(_ id: UUID, _ change: (inout PendingPost) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[index])
        persist()
    }

    private func persist() {
        store.save(items)
    }

    private static let genericMessage = "La publication a échoué. Réessayez."

    private static func message(for error: PostServiceError) -> String {
        switch error {
        case let .rateLimited(retryAfter):
            if let retryAfter, retryAfter > 0 {
                "Vous avez publié beaucoup de posts récemment. Réessayez dans \(max(1, retryAfter / 60)) min."
            } else {
                "Vous avez publié beaucoup de posts récemment. Réessayez plus tard."
            }
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        default: genericMessage
        }
    }
}

import Foundation
import Observation

/// Publication en attente, persistée : elle survit à la fermeture de l'écran et de l'app (ADR-008).
nonisolated struct PendingPost: Codable, Equatable, Identifiable {
    /// Prochaine étape à exécuter ; chaque étape franchie est enregistrée avant la suivante.
    enum Step: String, Codable {
        /// Photos préparées : intention d'upload, envoi du fichier, `complete`, photo par photo.
        case upload
        /// Médias envoyés : traitement par le worker.
        case processing
        /// Médias prêts : création du post.
        case create
    }

    let id: UUID
    /// Profil qui publie : une publication n'est jamais reprise pour un autre compte.
    let authorId: String
    let caption: String
    var kind: PostKind?
    /// Photos du post (1 à 10), dans l'ordre d'affichage.
    var media: [PendingMedia]
    var step: Step
    /// Échec affiché dans le bandeau (« Réessayer », « Supprimer ») ; `nil` pendant la publication.
    var failureMessage: String?
}

/// Une photo d'une publication en attente.
nonisolated struct PendingMedia: Codable, Equatable {
    /// Photo JPEG préparée (sans métadonnées), dans le dossier de la file.
    let fileName: String
    let sizeBytes: Int
    let width: Int
    let height: Int
    /// Renseigné une fois la photo envoyée : une relance ne la renvoie pas.
    var mediaId: String?
    var altText: String?
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

/// Publier une ou plusieurs photos : utilisé par l'écran de création.
protocol PostPublishing: AnyObject {
    /// Prépare les photos et les ajoute à la file ; la suite (envoi, traitement, création) continue sans l'écran.
    func publish(video: URL, caption: String, authorId: String, altText: String) async throws(UploadError)
    func publish(images: [Data], caption: String, authorId: String, mediaAltTexts: [String]) async throws(UploadError)
}

/**
 File de publication (ADR-008) : photos préparées → envoi → traitement → `POST /v1/posts`, chaque étape
 enregistrée. Au lancement, `resume` reprend là où la publication s'était arrêtée. Alimente le bandeau
 « Publication en cours » ; comme sur Instagram, une photo en échec fait échouer tout le post, et
 « Réessayer » ne refait que ce qui n'a pas abouti (les photos déjà envoyées ne sont pas renvoyées).
 */
@Observable
final class PublishQueue: PostPublishing {
    typealias PrepareVideo = @Sendable (URL, URL) async throws -> PreparedImage
    typealias Prepare = @Sendable (Data, URL) async throws(ImagePreparationError) -> PreparedImage

    private(set) var items: [PendingPost]
    /// Incrémenté à chaque post publié : grille et compteurs du profil se rechargent.
    private(set) var publishedCount = 0

    private let store: any PendingPostStore
    private let uploads: any MediaUploading
    private let posts: any PostService
    private let analytics: any AnalyticsService
    private let prepareVideo: PrepareVideo
    private var sessionGeneration = 0
    private let prepare: Prepare
    private var tasks: [UUID: Task<Void, Never>] = [:]

    init(
        store: any PendingPostStore,
        uploads: any MediaUploading,
        posts: any PostService,
        analytics: any AnalyticsService = NoopAnalyticsService(),
        prepare: @escaping Prepare = { data, directory throws(ImagePreparationError) in
            try await ImagePreparer.prepare(data, in: directory)
        },
        prepareVideo: @escaping PrepareVideo = { try await VideoPreparer.prepare($0, in: $1) }
    ) {
        self.store = store
        self.uploads = uploads
        self.posts = posts
        self.analytics = analytics
        self.prepareVideo = prepareVideo
        self.prepare = prepare
        items = store.load()
    }

    /// Première photo : vignette du bandeau.
    func fileURL(of item: PendingPost) -> URL? {
        item.kind == .reel ? nil : item.media.first.map(fileURL(of:))
    }

    func publish(images: [Data], caption: String, authorId: String, mediaAltTexts: [String]) async throws(UploadError) {
        let generation = sessionGeneration
        var media: [PendingMedia] = []
        for (index, data) in images.enumerated() {
            do {
                let image = try await prepare(data, store.directory)
                guard generation == sessionGeneration, !Task.isCancelled else {
                    try? FileManager.default.removeItem(at: image.fileURL)
                    removeFiles(of: media)
                    throw UploadError.unauthenticated
                }
                media.append(PendingMedia(
                    fileName: image.fileURL.lastPathComponent,
                    sizeBytes: image.sizeBytes,
                    width: image.width,
                    height: image.height,
                    altText: mediaAltTexts.indices.contains(index) ? mediaAltTexts[index] : nil
                ))
            } catch let error as UploadError {
                removeFiles(of: media)
                throw error
            } catch {
                removeFiles(of: media)
                throw .unreadableImage
            }
        }
        let item = PendingPost(id: UUID(), authorId: authorId, caption: caption, media: media, step: .upload)
        items.append(item)
        persist()
        start(item.id)
    }

    func publish(video: URL, caption: String, authorId: String, altText: String) async throws(UploadError) {
        let generation = sessionGeneration
        let prepared: PreparedImage
        do { prepared = try await prepareVideo(video, store.directory) }
        catch let error as UploadError { throw error }
        catch { throw .rejected(.invalidVideo) }
        guard generation == sessionGeneration, !Task.isCancelled else {
            try? FileManager.default.removeItem(at: prepared.fileURL)
            throw .unauthenticated
        }
        let media = PendingMedia(
            fileName: prepared.fileURL.lastPathComponent,
            sizeBytes: prepared.sizeBytes,
            width: prepared.width,
            height: prepared.height,
            altText: altText
        )
        let item = PendingPost(id: UUID(), authorId: authorId, caption: caption, kind: .reel, media: [media], step: .upload)
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

    /// Abandonne la publication : photos locales supprimées ; un média déjà envoyé sera purgé (ADR-008).
    func discard(_ id: UUID) {
        tasks.removeValue(forKey: id)?.cancel()
        guard let item = items.first(where: { $0.id == id }) else { return }
        removeFiles(of: item.media)
        items.removeAll { $0.id == id }
        persist()
    }

    /// À la déconnexion : rien n'est publié pour le compte suivant.
    func discardAll() {
        sessionGeneration += 1
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

    /// Envoie une à une les photos pas encore envoyées ; chaque envoi réussi est enregistré.
    private func upload(_ item: PendingPost) async {
        for (index, media) in item.media.enumerated() where media.mediaId == nil {
            let image = PreparedImage(
                fileURL: fileURL(of: media),
                sizeBytes: media.sizeBytes,
                mimeType: item.kind == .reel ? "video/mp4" : "image/jpeg",
                width: media.width,
                height: media.height
            )
            do {
                let mediaId = try await uploads.send(image, purpose: .post)
                update(item.id) { $0.media[index].mediaId = mediaId }
            } catch {
                fail(item.id, UploadError.message(for: error, isVideo: item.kind == .reel))
                return
            }
        }
        update(item.id) { $0.step = .processing }
    }

    private func waitForProcessing(_ item: PendingPost) async {
        for (index, media) in item.media.enumerated() {
            guard let mediaId = media.mediaId else {
                update(item.id) { $0.step = .upload }
                return
            }
            do {
                try await uploads.waitUntilProcessed(mediaId: mediaId, isVideo: item.kind == .reel)
            } catch {
                // Photo refusée par le worker : « Réessayer » ne renvoie qu'elle.
                if case .rejected = error {
                    update(item.id) {
                        $0.media[index].mediaId = nil
                        $0.step = .upload
                    }
                }
                fail(item.id, UploadError.message(for: error, isVideo: item.kind == .reel))
                return
            }
        }
        update(item.id) { $0.step = .create }
    }

    private func create(_ item: PendingPost) async {
        let mediaIds = item.media.compactMap(\.mediaId)
        guard mediaIds.count == item.media.count else {
            update(item.id) { $0.step = .upload }
            return
        }
        do {
            if item.kind == .reel, let mediaId = mediaIds.first {
                _ = try await posts.createReel(caption: item.caption, mediaId: mediaId, mediaAltTexts: item.media.map { $0.altText ?? "" })
            } else {
                _ = try await posts.createPost(
                    caption: item.caption,
                    mediaIds: mediaIds,
                    mediaAltTexts: item.media.map { $0.altText ?? "" }
                )
            }
        } catch .mediaAlreadyAttached {
            // Le post a déjà été créé (réponse perdue avant la fermeture de l'app) : publication réussie.
        } catch .mediaNotReady {
            update(item.id) { $0.step = .processing }
            return
        } catch .mediaNotFound, .mediaPurposeMismatch, .mediaKindMismatch {
            // Médias inutilisables : « Réessayer » renvoie toutes les photos.
            update(item.id) {
                for index in $0.media.indices {
                    $0.media[index].mediaId = nil
                }
                $0.step = .upload
            }
            fail(item.id, Self.genericMessage)
            return
        } catch {
            fail(item.id, Self.message(for: error))
            return
        }
        analytics.track(.postPublished(mediaCount: item.media.count))
        finish(item.id)
    }

    private func finish(_ id: UUID) {
        discard(id)
        publishedCount += 1
        AccessibilityFeedback.announce("Publication partagée")
    }

    private func fail(_ id: UUID, _ message: String) {
        update(id) { $0.failureMessage = message }
        AccessibilityFeedback.announce("Échec de la publication. \(message)")
    }

    private func update(_ id: UUID, _ change: (inout PendingPost) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[index])
        persist()
    }

    private func fileURL(of media: PendingMedia) -> URL {
        store.directory.appending(path: media.fileName)
    }

    private func removeFiles(of media: [PendingMedia]) {
        for item in media {
            try? FileManager.default.removeItem(at: fileURL(of: item))
        }
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
        case .tooManyMentions: "Vous pouvez mentionner au maximum 20 comptes. Publiez à nouveau avec une légende plus courte."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        default: genericMessage
        }
    }
}

extension PostPublishing {
    func publish(video _: URL, caption _: String, authorId _: String, altText _: String) async throws(UploadError) {
        throw .unexpected
    }
}

extension PostPublishing {
    func publish(images: [Data], caption: String, authorId: String) async throws(UploadError) {
        try await publish(images: images, caption: caption, authorId: authorId, mediaAltTexts: [])
    }

    func publish(video: URL, caption: String, authorId: String) async throws(UploadError) {
        try await publish(video: video, caption: caption, authorId: authorId, altText: "")
    }
}

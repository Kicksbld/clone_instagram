import Foundation
import Observation

/// Un commentaire de premier niveau et ses réponses, repliables comme sur Instagram.
struct CommentThread: Equatable, Identifiable {
    var comment: Comment
    /// Réponses chargées ou publiées par moi, de la plus récente à la plus ancienne.
    var replies: [Comment] = []
    /// Réponses affichées (« Afficher les N réponses ») ou repliées (« Masquer les réponses »).
    var isExpanded = false
    var isLoadingReplies = false
    /// Première page de réponses déjà chargée ; `repliesCursor` donne la suivante.
    var hasLoadedReplies = false
    var repliesCursor: String?

    var id: String {
        comment.id
    }

    /// Réponses pas encore affichées.
    var hiddenReplyCount: Int {
        isExpanded ? max(0, comment.replyCount - replies.count) : comment.replyCount
    }
}

/// « Répondre » : commentaire de premier niveau visé, et username affiché dans le bandeau.
struct ReplyTarget: Equatable {
    let parentId: String
    let username: String
}

/**
 Feuille des commentaires d'un post (`GET /v1/posts/{id}/comments`, du plus récent au plus ancien) : réponses
 repliables (un seul niveau), « Répondre », commentaire publié tout de suite (optimiste, retour arrière en
 cas d'échec, ADR-010) et suppression par glissement. Le nombre de commentaires du post est partagé avec
 les autres écrans (`CommentCountStore`).
 */
@Observable
final class CommentsViewModel {
    enum State: Equatable {
        case loading
        case loaded
        /// Post supprimé ou devenu invisible (`404`).
        case postGone
        case failed(message: String)
    }

    /// `maxLength` du contrat.
    static let maxBodyLength = 2200

    private(set) var state: State = .loading
    private(set) var threads: [CommentThread] = []
    private(set) var isLoadingMore = false
    /// Commentaire en cours de saisie.
    var draft = ""
    /// Bandeau « En réponse à @x » ; `nil` pour un commentaire de premier niveau.
    private(set) var replyTarget: ReplyTarget?
    /// Échec d'un envoi ou d'une suppression, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?

    let postId: String
    private let viewer: PostAuthor
    private let service: any CommentService
    private let counts: CommentCountStore
    /// Nombre de commentaires affiché à l'ouverture, si le post n'est pas encore dans `counts`.
    private let initialCount: Int
    private let now: () -> Date
    private var nextCursor: String?

    init(
        route: CommentsRoute,
        viewer: PostAuthor,
        service: any CommentService,
        counts: CommentCountStore,
        now: @escaping () -> Date = Date.init
    ) {
        postId = route.postId
        initialCount = route.commentCount
        self.viewer = viewer
        self.service = service
        self.counts = counts
        self.now = now
    }

    /// Corps envoyé : sans espaces en début ni en fin, 1 à 2 200 caractères.
    var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var canSend: Bool {
        state == .loaded && !trimmedDraft.isEmpty && trimmedDraft.count <= Self.maxBodyLength
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    // MARK: - Chargement

    func load() async {
        state = .loading
        do {
            let page = try await service.listComments(postId: postId, cursor: nil)
            threads = page.items.map { CommentThread(comment: $0) }
            nextCursor = page.nextCursor
            state = .loaded
        } catch {
            state = Self.loadFailure(error)
        }
    }

    /// Page suivante, à l'approche du bas de la liste.
    func commentAppeared(_ comment: Comment) async {
        guard hasMore, !isLoadingMore, threads.suffix(3).contains(where: { $0.id == comment.id }) else { return }
        await loadMore()
    }

    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await service.listComments(postId: postId, cursor: cursor)
            let known = Set(threads.map(\.id))
            threads += page.items.filter { !known.contains($0.id) }.map { CommentThread(comment: $0) }
            nextCursor = page.nextCursor
        } catch .postNotFound {
            state = .postGone
        } catch {
            errorMessage = "Impossible de charger plus de commentaires. Réessayez."
        }
    }

    /// « Afficher les N réponses » : déplie le fil, puis charge la page suivante de réponses si besoin.
    func showReplies(of threadId: String) async {
        guard let index = index(of: threadId), !threads[index].isLoadingReplies else { return }
        threads[index].isExpanded = true
        let thread = threads[index]
        guard !thread.hasLoadedReplies || thread.repliesCursor != nil else { return }
        threads[index].isLoadingReplies = true
        do {
            let page = try await service.listReplies(
                commentId: threadId,
                cursor: thread.hasLoadedReplies ? thread.repliesCursor : nil
            )
            guard let index = self.index(of: threadId) else { return }
            let known = Set(threads[index].replies.map(\.id))
            threads[index].replies += page.items.filter { !known.contains($0.id) }
            threads[index].hasLoadedReplies = true
            threads[index].repliesCursor = page.nextCursor
            threads[index].isLoadingReplies = false
        } catch {
            guard let index = self.index(of: threadId) else { return }
            threads[index].isLoadingReplies = false
            if error == .commentNotFound {
                threads.remove(at: index)
            } else {
                errorMessage = "Impossible de charger les réponses. Réessayez."
            }
        }
    }

    /// « Masquer les réponses ».
    func hideReplies(of threadId: String) {
        guard let index = index(of: threadId) else { return }
        threads[index].isExpanded = false
    }

    // MARK: - Publication

    /// « Répondre » sur un commentaire ou une réponse : la réponse va au commentaire de premier niveau
    /// (un seul niveau, comme Instagram).
    func reply(to comment: Comment) {
        guard !comment.isPending else { return }
        replyTarget = ReplyTarget(parentId: comment.parentId ?? comment.id, username: comment.author.username)
    }

    func cancelReply() {
        replyTarget = nil
    }

    /// Publie le brouillon : affiché tout de suite, remplacé par la réponse de l'API, retiré en cas d'échec.
    func send() async {
        guard canSend else { return }
        let body = trimmedDraft
        let target = replyTarget
        let pending = Comment(
            id: "pending-\(UUID().uuidString)",
            postId: postId,
            parentId: target?.parentId,
            author: viewer,
            body: body,
            replyCount: 0,
            createdAt: now(),
            canDelete: false,
            isPending: true
        )
        insert(pending)
        draft = ""
        replyTarget = nil
        adjustCount(by: 1)

        do {
            let created = try await service.createComment(postId: postId, body: body, parentId: target?.parentId)
            replace(pending.id, with: created)
        } catch {
            remove(pending)
            adjustCount(by: -1)
            switch error {
            case .postNotFound:
                state = .postGone
                return
            case .commentNotFound:
                // Le commentaire auquel je réponds a disparu (supprimé, ou auteur devenu invisible).
                threads.removeAll { $0.id == target?.parentId }
                errorMessage = "Ce commentaire n'est plus disponible."
            default:
                errorMessage = Self.message(sending: error)
            }
            if draft.isEmpty {
                draft = body
                if let target, index(of: target.parentId) != nil {
                    replyTarget = target
                }
            }
        }
    }

    // MARK: - Suppression

    /// Suppression par glissement (mon commentaire, ou un commentaire de mon post) : retiré tout de suite,
    /// remis en cas d'échec ; un commentaire supprime ses réponses.
    func delete(_ comment: Comment) async {
        guard comment.canDelete, !comment.isPending else { return }
        let snapshot = threads
        let removed = comment.parentId == nil ? 1 + comment.replyCount : 1
        remove(comment)
        adjustCount(by: -removed)
        do {
            try await service.deleteComment(id: comment.id)
        } catch .commentNotFound {
            // Déjà supprimé (réponse perdue, ou supprimé par l'auteur du post) : le résultat attendu est atteint.
        } catch {
            threads = snapshot
            adjustCount(by: removed)
            errorMessage = error == .unreachable
                ? "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
                : "Le commentaire n'a pas pu être supprimé. Réessayez."
        }
    }

    // MARK: - Fils

    private func index(of threadId: String) -> Int? {
        threads.firstIndex { $0.id == threadId }
    }

    /// Nouveau commentaire en tête de liste ; nouvelle réponse en tête de son fil, déplié.
    private func insert(_ comment: Comment) {
        if let parentId = comment.parentId, let index = index(of: parentId) {
            threads[index].replies.insert(comment, at: 0)
            threads[index].comment.replyCount += 1
            threads[index].isExpanded = true
        } else {
            threads.insert(CommentThread(comment: comment), at: 0)
        }
    }

    private func replace(_ pendingId: String, with comment: Comment) {
        if let parentId = comment.parentId, let index = index(of: parentId) {
            guard let position = threads[index].replies.firstIndex(where: { $0.id == pendingId }) else { return }
            threads[index].replies[position] = comment
        } else if let index = index(of: pendingId) {
            threads[index].comment = comment
        }
    }

    private func remove(_ comment: Comment) {
        if let parentId = comment.parentId, let index = index(of: parentId) {
            guard threads[index].replies.contains(where: { $0.id == comment.id }) else { return }
            threads[index].replies.removeAll { $0.id == comment.id }
            threads[index].comment.replyCount = max(0, threads[index].comment.replyCount - 1)
        } else {
            threads.removeAll { $0.id == comment.id }
        }
    }

    private func adjustCount(by delta: Int) {
        counts.adjust(postId: postId, by: delta, fallback: initialCount)
    }

    // MARK: - Messages

    private static func loadFailure(_ error: CommentServiceError) -> State {
        error == .postNotFound
            ? .postGone
            : .failed(message: "Impossible de charger les commentaires. Vérifiez votre connexion et réessayez.")
    }

    /// Message compréhensible, sans détail technique (ADR-014).
    static func message(sending error: CommentServiceError) -> String {
        switch error {
        case .rateLimited:
            "Vous avez publié beaucoup de commentaires en peu de temps. Réessayez dans un instant."
        case .unauthenticated:
            "Votre session a expiré. Reconnectez-vous."
        case .unreachable:
            "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .postNotFound, .commentNotFound, .replyToReply, .profileNotFound, .invalidCursor, .invalidInput,
             .unexpectedResponse:
            "Votre commentaire n'a pas pu être publié. Réessayez."
        }
    }
}

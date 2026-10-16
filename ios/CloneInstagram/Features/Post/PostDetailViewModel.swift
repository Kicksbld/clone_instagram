import Foundation
import Observation

/// Détail d'un post (`GET /v1/posts/{id}`) ; invisible ou supprimé → « Cette publication n'est pas disponible ».
/// L'auteur peut le supprimer (`DELETE /v1/posts/{id}`, optimiste et partagé par `PostDeletionStore`).
@Observable
final class PostDetailViewModel {
    enum State: Equatable {
        case loading
        case loaded(Post)
        case notFound
        case failed(message: String)
    }

    private(set) var state: State = .loading
    /// Échec d'un like ou d'un unlike (état revenu en arrière), affiché en alerte ; `nil` une fois fermée.
    var likeErrorMessage: String?

    private let postId: String
    private let viewerId: String
    private let posts: any PostService
    private let likes: LikeSynchronizer
    private let commentCounts: CommentCountStore
    private let deletions: PostDeletionStore

    init(
        postId: String,
        viewerId: String,
        posts: any PostService,
        likes: LikeSynchronizer,
        commentCounts: CommentCountStore = CommentCountStore(),
        deletions: PostDeletionStore
    ) {
        self.postId = postId
        self.viewerId = viewerId
        self.posts = posts
        self.likes = likes
        self.commentCounts = commentCounts
        self.deletions = deletions
    }

    /// Menu « … » : « Supprimer » seulement sur mes posts.
    var canDelete: Bool {
        if case let .loaded(post) = state {
            post.author.id == viewerId
        } else {
            false
        }
    }

    /// Supprime le post : l'écran se ferme sans attendre l'API ; un échec réaffiche le post ailleurs, avec un
    /// message (`PostDeletionStore`).
    func delete() async {
        guard canDelete else { return }
        await deletions.delete(postId: postId)
    }

    /// Le post avec son dernier état de like et son nombre de commentaires, partagés avec les autres écrans.
    func displayed(_ post: Post) -> Post {
        commentCounts.displayed(likes.displayed(post))
    }

    /// Bouton J'aime : like ou unlike, affiché tout de suite (optimiste).
    func toggleLike() async {
        guard case let .loaded(post) = state else { return }
        await handle(likes.toggleLike(post))
    }

    /// Double tap sur la photo : like seulement, jamais d'unlike (comme Instagram).
    func likeFromDoubleTap() async {
        guard case let .loaded(post) = state else { return }
        await handle(likes.likeFromDoubleTap(post))
    }

    private func handle(_ outcome: LikeOutcome?) {
        switch outcome {
        case let .reverted(message):
            likeErrorMessage = message
        case .postGone:
            state = .notFound
        case .confirmed, nil:
            break
        }
    }

    func load() async {
        if case .loaded = state {} else {
            state = .loading
        }
        do {
            let post = try await posts.fetchPost(id: postId)
            likes.record([post])
            commentCounts.record([post])
            state = .loaded(post)
        } catch .postNotFound {
            state = .notFound
        } catch {
            if case .loaded = state {
                return
            }
            state = .failed(message: "Impossible de charger la publication. Vérifiez votre connexion et réessayez.")
        }
    }
}

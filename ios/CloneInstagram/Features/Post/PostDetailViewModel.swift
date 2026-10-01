import Foundation
import Observation

/// Détail d'un post (`GET /v1/posts/{id}`) ; invisible ou supprimé → « Cette publication n'est pas disponible ».
/// L'auteur peut le supprimer (`DELETE /v1/posts/{id}`).
@Observable
final class PostDetailViewModel {
    enum State: Equatable {
        case loading
        case loaded(Post)
        case notFound
        case failed(message: String)
    }

    private(set) var state: State = .loading
    private(set) var isDeleting = false
    /// Échec de la suppression, affiché en alerte ; `nil` une fois fermée.
    var deleteErrorMessage: String?
    /// Échec d'un like ou d'un unlike (état revenu en arrière), affiché en alerte ; `nil` une fois fermée.
    var likeErrorMessage: String?

    private let postId: String
    private let viewerId: String
    private let posts: any PostService
    private let likes: LikeSynchronizer
    /// Après une suppression : grille et compteur de mon profil sont rechargés.
    private let onDeleted: () -> Void

    init(
        postId: String,
        viewerId: String,
        posts: any PostService,
        likes: LikeSynchronizer,
        onDeleted: @escaping () -> Void = {}
    ) {
        self.postId = postId
        self.viewerId = viewerId
        self.posts = posts
        self.likes = likes
        self.onDeleted = onDeleted
    }

    /// Menu « … » : « Supprimer » seulement sur mes posts.
    var canDelete: Bool {
        if case let .loaded(post) = state {
            post.author.id == viewerId
        } else {
            false
        }
    }

    /// Supprime le post ; `true` si l'écran peut se fermer.
    func delete() async -> Bool {
        guard canDelete, !isDeleting else { return false }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await posts.deletePost(id: postId)
        } catch .postNotFound {
            // Déjà supprimé (réponse perdue lors d'un premier essai) : le résultat attendu est atteint.
        } catch .unreachable {
            deleteErrorMessage = "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
            return false
        } catch {
            deleteErrorMessage = "La publication n'a pas pu être supprimée. Réessayez."
            return false
        }
        onDeleted()
        return true
    }

    /// Le post avec son dernier état de like, partagé avec les autres écrans.
    func displayed(_ post: Post) -> Post {
        likes.displayed(post)
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

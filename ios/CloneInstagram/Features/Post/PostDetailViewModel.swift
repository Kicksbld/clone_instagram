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

    private let postId: String
    private let viewerId: String
    private let posts: any PostService
    /// Après une suppression : grille et compteur de mon profil sont rechargés.
    private let onDeleted: () -> Void

    init(postId: String, viewerId: String, posts: any PostService, onDeleted: @escaping () -> Void = {}) {
        self.postId = postId
        self.viewerId = viewerId
        self.posts = posts
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

    func load() async {
        if case .loaded = state {} else {
            state = .loading
        }
        do {
            state = try await .loaded(posts.fetchPost(id: postId))
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

import Foundation
import Observation

/**
 Nombre de commentaires des posts, partagé par tous les écrans (une instance pour l'app, comme les likes) :
 un commentaire publié depuis le détail se voit aussi dans le feed. Chaque écran affiche ses posts à
 travers `displayed(_:)`.
 */
@Observable
final class CommentCountStore {
    /// Dernier nombre connu, par post : lu dans une réponse de l'API, ou changé par la feuille de commentaires.
    private var counts: [String: Int] = [:]

    /// Le post avec son dernier nombre de commentaires connu.
    func displayed(_ post: Post) -> Post {
        guard let count = counts[post.id] else { return post }
        var post = post
        post.commentCount = count
        return post
    }

    /// Posts reçus de l'API : leur nombre devient le dernier connu.
    func record(_ posts: [Post]) {
        for post in posts {
            counts[post.id] = post.commentCount
        }
    }

    /// Dernier nombre connu ; `fallback` si le post n'a pas encore été vu.
    func count(for postId: String, fallback: Int) -> Int {
        counts[postId] ?? fallback
    }

    /// Commentaire publié (`+1`) ou supprimé (`-(1 + réponses)`), ou retour arrière.
    func adjust(postId: String, by delta: Int, fallback: Int) {
        counts[postId] = max(0, count(for: postId, fallback: fallback) + delta)
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        counts = [:]
    }
}

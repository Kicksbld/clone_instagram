import Foundation

/// Commentaire ou réponse d'un post, vu par moi (ADR-006).
struct Comment: Equatable, Identifiable {
    let id: String
    let postId: String
    /// Commentaire auquel celui-ci répond ; `nil` au premier niveau.
    let parentId: String?
    let author: PostAuthor
    let body: String
    /// Réponses ; modifié après une réponse publiée ou supprimée.
    var replyCount: Int
    let createdAt: Date
    /// Je peux le supprimer : j'en suis l'auteur, ou l'auteur du post.
    let canDelete: Bool
    /// Envoi en cours : affiché tout de suite, en attente de l'API (ADR-010).
    var isPending = false
}

/// Une page de commentaires ou de réponses (ADR-007) ; `nextCursor` est `nil` sur la dernière page.
struct CommentPage: Equatable {
    let items: [Comment]
    let nextCursor: String?
}

import Foundation

/// Post publié, vu par moi (ADR-006) : auteur, images dans l'ordre d'affichage, légende, likes.
struct Post: Equatable, Identifiable {
    let id: String
    let caption: String
    let author: PostAuthor
    let media: [PostMediaItem]
    /// Modifiables pour la mise à jour optimiste du like (ADR-010).
    var likeCount = 0
    /// J'aime ce post.
    var isLiked = false
    let createdAt: Date

    /// Première image : vignette de la grille.
    var cover: PostMediaItem? {
        media.first
    }
}

struct PostAuthor: Equatable {
    let id: String
    let username: String
    let avatar: ImageVariants?
}

/// Une image d'un post ; `width` / `height` (pixels) donnent son ratio d'affichage.
struct PostMediaItem: Equatable {
    let variants: ImageVariants
    let width: Int
    let height: Int

    /// Largeur / hauteur.
    var aspectRatio: Double {
        Double(width) / Double(max(height, 1))
    }
}

/// Une page de posts (ADR-007) ; `nextCursor` est `nil` sur la dernière page.
struct PostPage: Equatable {
    let items: [Post]
    let nextCursor: String?
}

/// État de mon like après `PUT` / `DELETE /v1/posts/{id}/like`, et nombre de likes du post.
struct LikeStatus: Equatable {
    let isLiked: Bool
    let likeCount: Int
}

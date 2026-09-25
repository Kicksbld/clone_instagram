import Foundation

/// Post publié, vu par moi (ADR-006) : auteur, images dans l'ordre d'affichage, légende.
struct Post: Equatable, Identifiable {
    let id: String
    let caption: String
    let author: PostAuthor
    let media: [PostMediaItem]
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

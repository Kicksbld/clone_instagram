import Foundation

/// Post publié, vu par moi (ADR-006) : auteur, images dans l'ordre d'affichage, légende, likes, commentaires.
nonisolated enum PostKind: String, Codable { case post, reel }

struct Post: Equatable, Identifiable {
    var kind: PostKind = .post
    let id: String
    let caption: String
    let author: PostAuthor
    let media: [PostMediaItem]
    /// Modifiables pour la mise à jour optimiste du like (ADR-010).
    var likeCount = 0
    /// J'aime ce post.
    var isLiked = false
    /// Commentaires, réponses comprises ; modifiable après un commentaire publié ou supprimé.
    var commentCount = 0
    let createdAt: Date
    /// Onglet Amis des Reels (ADR-029) : jusqu'à 3 amis qui ont interagi, le plus récent d'abord.
    var friendInteractions: [FriendInteraction] = []
    /// Onglet Amis des Reels : nombre total d'amis qui ont interagi ; 0 ailleurs.
    var friendInteractionCount = 0
    var mentions: [TextMention] = []

    /// Première image : vignette de la grille.
    var cover: PostMediaItem? {
        media.first
    }
}

/// Association résolue à la création ; le username écrit survit aux renommages du compte.
struct TextMention: Equatable {
    let id: String
    let username: String
    let textUsername: String
    let avatar: ImageVariants?
}

struct PostAuthor: Equatable {
    let id: String
    let username: String
    let avatar: ImageVariants?
}

/// Ce qu'un ami (abonné mutuel) a fait d'un reel (ADR-029).
enum FriendInteractionKind: String, Equatable {
    case created
    case liked
    case commented
}

/// Un ami et ses interactions avec un reel ; `commentText` : son dernier commentaire.
struct FriendInteraction: Equatable, Identifiable {
    let user: PostAuthor
    let kinds: [FriendInteractionKind]
    let commentText: String?

    var id: String {
        user.id
    }
}

/// Une image d'un post ; `width` / `height` (pixels) donnent son ratio d'affichage.
struct PostMediaItem: Equatable {
    let variants: ImageVariants
    let width: Int
    let height: Int

    var hls: URL?
    var durationMs: Int?

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

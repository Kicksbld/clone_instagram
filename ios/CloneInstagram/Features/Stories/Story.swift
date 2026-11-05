import Foundation

/// Audience d'une story (ADR-025) : qui peut voir mes contenus, ou mes amis proches seulement.
nonisolated enum StoryAudience: Equatable {
    case everyone
    case closeFriends
}

/// Story photo active, vue par moi (ADR-006) : photo entière dans un cadre 9:16.
struct Story: Equatable, Identifiable {
    let id: String
    let author: PostAuthor
    let audience: StoryAudience
    var photo: PostMediaItem
    /// Je l'ai déjà vue (toujours vrai pour mes stories).
    var isSeen: Bool
    let createdAt: Date
    let expiresAt: Date
}

/// Un auteur du bandeau, d'après ses stories actives que je peux voir.
struct StoryTrayItem: Equatable, Identifiable {
    let author: PostAuthor
    /// J'ai vu toutes ses stories actives visibles.
    var isSeen: Bool
    /// Anneau distinct : au moins une story réservée à ses amis proches.
    let hasCloseFriendsStory: Bool
    let latestStoryAt: Date

    var id: String {
        author.id
    }
}

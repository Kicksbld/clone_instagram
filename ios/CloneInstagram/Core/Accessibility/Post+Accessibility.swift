import Foundation

extension Post {
    /// Tout le texte est lu, même quand la légende visuelle est repliée.
    func accessibilitySummary(page: Int) -> String {
        let index = min(max(page, 0), max(media.count - 1, 0))
        let description = media.indices.contains(index) ? media[index].accessibilityDescription : "Média indisponible"
        let position = kind == .reel ? "Reel" : "Photo \(index + 1) sur \(media.count)"
        return [
            "Publication de \(author.username)", position, description, caption,
            "\(likeCount) mentions J’aime", isLiked ? "Vous aimez cette publication" : "",
            "\(commentCount) commentaires", createdAt.formatted(date: .abbreviated, time: .shortened),
        ].filter { !$0.isEmpty }.joined(separator: ". ")
    }
}

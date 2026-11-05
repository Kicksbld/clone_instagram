import Foundation
import Observation

/**
 Légendes modifiées par l'auteur, partagées par tous les écrans (une instance pour l'app, comme les likes) :
 une légende enregistrée depuis le feed ou le détail se voit aussitôt dans le feed, le détail et les Reels,
 avec ses mentions recalculées par l'API. Chaque écran affiche ses posts à travers `displayed(_:)`.

 Pas de mise à jour optimiste (ADR-020 : texte validé par le serveur) : seule la réponse de l'API est gardée,
 jusqu'à la prochaine lecture du post (ADR-037).
 */
@Observable
final class PostEditStore {
    private struct Edit {
        let caption: String
        let mentions: [TextMention]
        let media: [PostMediaItem]
    }

    /// Dernière version enregistrée, par post.
    private var edits: [String: Edit] = [:]

    /// Le post avec sa dernière légende enregistrée.
    func displayed(_ post: Post) -> Post {
        guard let edit = edits[post.id] else { return post }
        var post = post
        post.caption = edit.caption
        post.mentions = edit.mentions
        post.media = edit.media
        return post
    }

    /// Post renvoyé par `PATCH /v1/posts/{id}`.
    func record(_ post: Post) {
        edits[post.id] = Edit(caption: post.caption, mentions: post.mentions, media: post.media)
    }

    /// Posts relus depuis l'API : leur légende fait foi, la version enregistrée localement est oubliée.
    func refreshed(_ posts: [Post]) {
        guard !edits.isEmpty else { return }
        for post in posts {
            edits[post.id] = nil
        }
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        edits = [:]
    }
}

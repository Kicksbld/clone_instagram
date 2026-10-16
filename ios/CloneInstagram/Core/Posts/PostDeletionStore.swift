import Foundation
import Observation

/**
 Suppression de mes posts, partagée par tous les écrans (une instance pour l'app, comme les likes) : un post
 supprimé depuis le feed ou son détail disparaît aussitôt du feed, du détail (qui se ferme) et de la grille
 de mon profil, et mon compteur de publications baisse. Chaque écran affiche ses posts à travers
 `visible(_:)`.

 Mise à jour optimiste sur le moteur commun `OptimisticSync` (ADR-020) : le post disparaît avant la réponse
 de l'API et réapparaît si elle échoue, avec un message (`errorMessage`, affiché par `App` : l'écran qui a
 demandé la suppression peut s'être fermé).
 */
@Observable
final class PostDeletionStore {
    /// Posts supprimés (en cours ou confirmés) : masqués de tous les écrans.
    private(set) var deletedIds: Set<String> = []
    /// Posts supprimés depuis le dernier chargement de mon profil : mon compteur de publications en tient
    /// compte jusqu'au prochain chargement.
    private var uncountedIds: Set<String> = []
    /// Échec d'une suppression (post réaffiché), affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?
    /// Un seul appel en cours par post.
    @ObservationIgnored private let sync = OptimisticSync<String, Bool>()
    @ObservationIgnored private let service: any PostService

    init(service: any PostService) {
        self.service = service
    }

    /// Les posts encore affichés : sans ceux que j'ai supprimés.
    func visible(_ posts: [Post]) -> [Post] {
        deletedIds.isEmpty ? posts : posts.filter { !deletedIds.contains($0.id) }
    }

    func isDeleted(_ postId: String) -> Bool {
        deletedIds.contains(postId)
    }

    /// Mon profil, avec mon compteur de publications à jour des suppressions faites depuis son chargement.
    func displayed(me profile: Profile) -> Profile {
        var profile = profile
        profile.postCount = max(0, profile.postCount - uncountedIds.count)
        return profile
    }

    /// Mon profil vient d'être rechargé : son compteur de publications compte déjà les suppressions confirmées.
    func myProfileReloaded() {
        uncountedIds = uncountedIds.filter { sync.isSyncing($0) }
    }

    /// `DELETE /v1/posts/{id}` d'un de mes posts (confirmé par l'utilisateur) : masqué tout de suite ; déjà
    /// supprimé (`404`, réponse perdue d'un premier essai) = résultat atteint.
    func delete(postId: String) async {
        guard !deletedIds.contains(postId) else { return }
        deletedIds.insert(postId)
        uncountedIds.insert(postId)

        let outcome = await sync.sync(
            postId,
            to: true,
            confirmed: false,
            intentOf: { $0 }
        ) { _ throws(PostServiceError) -> Bool in
            do throws(PostServiceError) {
                try await service.deletePost(id: postId)
            } catch {
                guard error == .postNotFound else { throw error }
            }
            return true
        }
        if case let .failed(error, _, _) = outcome {
            deletedIds.remove(postId)
            uncountedIds.remove(postId)
            errorMessage = error == .unreachable
                ? "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
                : "La publication n'a pas pu être supprimée. Réessayez."
        }
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        deletedIds = []
        uncountedIds = []
        errorMessage = nil
        sync.reset()
    }
}

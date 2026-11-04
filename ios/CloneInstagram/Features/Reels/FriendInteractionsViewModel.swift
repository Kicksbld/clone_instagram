import Foundation
import Observation

/// Feuille « Amis » d'un reel (ADR-029) : tous les amis qui l'ont créé, aimé ou commenté, du plus
/// récent au plus ancien ; erreur affichée avec possibilité de réessayer.
@Observable
final class FriendInteractionsViewModel {
    enum State: Equatable {
        case loading
        case loaded([FriendInteraction])
        /// Reel supprimé ou devenu invisible (`post_not_found`).
        case unavailable
        case failed
    }

    private(set) var state: State = .loading
    let reelId: String
    private let service: any PostService

    init(reelId: String, posts: any PostService) {
        self.reelId = reelId
        service = posts
    }

    func load() async {
        state = .loading
        do {
            state = try await .loaded(service.listReelFriendInteractions(reelId: reelId))
        } catch .postNotFound {
            state = .unavailable
        } catch {
            state = .failed
        }
    }
}

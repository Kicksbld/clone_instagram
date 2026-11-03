import Foundation
import Observation

/// Bandeau des stories en haut du feed (`GET /v1/stories/tray`) : ma story d'abord, puis les auteurs non
/// vus, puis les vus (ordre de l'API, ADR-025).
@Observable
final class StoryTrayViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed
    }

    private(set) var state: State = .loading
    private(set) var items: [StoryTrayItem] = []
    let currentUser: PostAuthor
    private let service: any StoryService

    init(currentUser: PostAuthor, service: any StoryService) {
        self.currentUser = currentUser
        self.service = service
    }

    /// Ma story active, en tête du bandeau.
    var myItem: StoryTrayItem? {
        items.first { $0.author.id == currentUser.id }
    }

    /// Les autres auteurs, dans l'ordre du bandeau.
    var otherItems: [StoryTrayItem] {
        items.filter { $0.author.id != currentUser.id }
    }

    /// Premier chargement, retour du viewer, publication ou tirer pour rafraîchir ; un échec garde le bandeau
    /// déjà affiché.
    func load() async {
        if items.isEmpty {
            state = .loading
        }
        do {
            items = try await service.tray()
            state = .loaded
        } catch {
            if items.isEmpty {
                state = .failed
            }
        }
    }
}

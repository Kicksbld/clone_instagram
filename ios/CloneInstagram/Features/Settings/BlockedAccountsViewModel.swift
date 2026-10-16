import Foundation
import Observation

/**
 Paramètres > Comptes bloqués (`GET /v1/me/blocks`, pages de 20) : « Débloquer » sur chaque ligne ; comme
 Instagram, un compte débloqué reste affiché avec « Bloquer » jusqu'au prochain chargement. Blocage et
 déblocage optimistes, partagés par `BlockStore` (ADR-020).
 */
@Observable
final class BlockedAccountsViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(message: String)
    }

    private(set) var state: State = .loading
    private(set) var users: [UserSummary] = []
    private(set) var isLoadingMore = false
    /// Échec d'une action, affiché en alerte ; `nil` une fois fermée.
    var actionErrorMessage: String?

    private let social: any SocialService
    private let blocks: BlockStore
    private var nextCursor: String?

    init(social: any SocialService, blocks: BlockStore) {
        self.social = social
        self.blocks = blocks
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    func isBlocked(_ user: UserSummary) -> Bool {
        blocks.isBlocked(user.id)
    }

    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await social.listBlocks(cursor: nil)
            blocks.record(blocked: page.items)
            users = page.items
            nextCursor = page.nextCursor
            state = .loaded
        } catch {
            if state != .loaded {
                state = .failed(message: "Impossible de charger les comptes bloqués. Vérifiez votre connexion et réessayez.")
            }
        }
    }

    /// Page suivante, appelée quand la dernière ligne apparaît.
    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await social.listBlocks(cursor: cursor)
            let known = Set(users.map(\.id))
            let added = page.items.filter { !known.contains($0.id) }
            blocks.record(blocked: added)
            users += added
            nextCursor = page.nextCursor
        } catch {
            actionErrorMessage = "Impossible de charger la suite. Vérifiez votre connexion et réessayez."
        }
    }

    /// « Débloquer », ou « Bloquer » sur un compte débloqué depuis l'ouverture : changé tout de suite, sans
    /// bloquer le bouton.
    func toggleBlock(_ user: UserSummary) async {
        let outcome = if isBlocked(user) {
            await blocks.unblock(userId: user.id)
        } else {
            await blocks.block(userId: user.id)
        }
        if case let .reverted(message)? = outcome {
            actionErrorMessage = message
        }
    }
}

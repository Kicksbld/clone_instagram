import Foundation
import Observation

/**
 Paramètres > Comptes bloqués (`GET /v1/me/blocks`, pages de 20) : « Débloquer » sur chaque ligne ; comme
 Instagram, un compte débloqué reste affiché avec « Bloquer » jusqu'au prochain chargement.
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
    /// Comptes débloqués depuis l'ouverture de l'écran.
    private(set) var unblockedIds: Set<String> = []
    /// Déblocage ou blocage en cours.
    private(set) var pendingIds: Set<String> = []
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
        !unblockedIds.contains(user.id)
    }

    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await social.listBlocks(cursor: nil)
            users = page.items
            nextCursor = page.nextCursor
            unblockedIds = []
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
            users += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            actionErrorMessage = "Impossible de charger la suite. Vérifiez votre connexion et réessayez."
        }
    }

    /// « Débloquer », ou « Bloquer » sur un compte débloqué depuis l'ouverture.
    func toggleBlock(_ user: UserSummary) async {
        guard !pendingIds.contains(user.id) else { return }
        pendingIds.insert(user.id)
        defer { pendingIds.remove(user.id) }
        do {
            if isBlocked(user) {
                try await blocks.unblock(userId: user.id)
                unblockedIds.insert(user.id)
            } else {
                try await blocks.block(userId: user.id)
                unblockedIds.remove(user.id)
            }
        } catch {
            actionErrorMessage = BlockStore.message(for: error)
        }
    }
}

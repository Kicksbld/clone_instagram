import Foundation
import Observation

/// Grille des posts d'un profil (`GET /v1/users/{id}/posts`) : pages de 12, du plus récent au plus ancien.
@Observable
final class ProfilePostsViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(message: String)
    }

    private(set) var state: State = .loading
    private(set) var posts: [Post] = []
    private(set) var isLoadingMore = false
    /// Échec de la page suivante, affiché sous la grille.
    private(set) var loadMoreFailed = false

    private let userId: String
    private let service: any PostService
    private var nextCursor: String?

    init(userId: String, posts: any PostService) {
        self.userId = userId
        service = posts
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    /// Première page ; un rafraîchissement garde la grille affichée pendant le chargement.
    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await service.listPosts(of: userId, cursor: nil)
            posts = page.items
            nextCursor = page.nextCursor
            loadMoreFailed = false
            state = .loaded
        } catch {
            if state != .loaded {
                state = .failed(message: "Impossible de charger les publications. Vérifiez votre connexion et réessayez.")
            }
        }
    }

    /// Page suivante, appelée quand l'une des dernières vignettes apparaît.
    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await service.listPosts(of: userId, cursor: cursor)
            let known = Set(posts.map(\.id))
            posts += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
            loadMoreFailed = false
        } catch {
            loadMoreFailed = true
        }
    }

    /// La vignette `post` est parmi les dernières : charger la suite avant d'atteindre le bas.
    func shouldLoadMore(after post: Post) -> Bool {
        guard hasMore, let index = posts.firstIndex(of: post) else { return false }
        return index >= posts.count - 6
    }
}

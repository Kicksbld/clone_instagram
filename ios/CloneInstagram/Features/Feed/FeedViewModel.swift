import Foundation
import Observation

/// Feed d'accueil (`GET /v1/feed`) : posts des comptes suivis et les miens, du plus récent au plus ancien,
/// par pages de 12. Comme Instagram, les posts des 3 derniers jours viennent d'abord, puis le repère
/// « Vous êtes à jour » ; les plus anciens s'affichent à la demande.
@Observable
final class FeedViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(message: String)
    }

    /// Fenêtre des nouvelles publications, avant le repère « Vous êtes à jour ».
    static let recentWindow: TimeInterval = 3 * 24 * 60 * 60
    /// Posts suivants dont les photos sont préchargées.
    private static let prefetchDistance = 3

    private(set) var state: State = .loading
    /// Tous les posts chargés, du plus récent au plus ancien, y compris ceux que je viens de supprimer.
    private var loadedPosts: [Post] = []
    private(set) var isLoadingMore = false
    /// Échec de la page suivante, affiché sous le feed.
    private(set) var loadMoreFailed = false
    /// « Afficher les publications plus anciennes » a été touché.
    private(set) var isShowingOlder = false
    /// Échec d'un like ou d'un unlike (état revenu en arrière), affiché en alerte ; `nil` une fois fermée.
    var likeErrorMessage: String?

    private let viewerId: String
    private let service: any PostService
    private let likes: LikeSynchronizer
    private let commentCounts: CommentCountStore
    private let deletions: PostDeletionStore
    private let prefetcher: any ImagePrefetching
    private let now: () -> Date
    private var nextCursor: String?
    /// Révision des comptes bloqués déjà prise en compte.
    private var loadedRevision: Int?

    init(
        viewerId: String,
        posts: any PostService,
        likes: LikeSynchronizer,
        commentCounts: CommentCountStore = CommentCountStore(),
        deletions: PostDeletionStore,
        prefetcher: any ImagePrefetching,
        now: @escaping () -> Date = Date.init
    ) {
        self.viewerId = viewerId
        service = posts
        self.likes = likes
        self.commentCounts = commentCounts
        self.deletions = deletions
        self.prefetcher = prefetcher
        self.now = now
    }

    /// Posts affichables, du plus récent au plus ancien : sans ceux que j'ai supprimés (`PostDeletionStore`).
    var posts: [Post] {
        deletions.visible(loadedPosts)
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    /// Posts des 3 derniers jours, en tête du feed.
    var recentPosts: [Post] {
        let threshold = now().addingTimeInterval(-Self.recentWindow)
        return Array(posts.prefix { $0.createdAt >= threshold })
    }

    /// Posts plus anciens, sous le repère « Vous êtes à jour ».
    var olderPosts: [Post] {
        Array(posts.dropFirst(recentPosts.count))
    }

    /// Tous les posts récents sont chargés : le repère « Vous êtes à jour » s'affiche après eux.
    var isCaughtUp: Bool {
        state == .loaded && !posts.isEmpty && (!olderPosts.isEmpty || !hasMore)
    }

    /// Le bouton « Afficher les publications plus anciennes » a quelque chose à montrer.
    var canShowOlder: Bool {
        !isShowingOlder && (!olderPosts.isEmpty || hasMore)
    }

    /// Posts affichés : les récents, puis les anciens une fois demandés.
    var visiblePosts: [Post] {
        isShowingOlder ? posts : recentPosts
    }

    /// Menu « … » : « Supprimer » seulement sur mes posts.
    func canDelete(_ post: Post) -> Bool {
        post.author.id == viewerId
    }

    /// Affichage de l'onglet : charge la première fois, ou après un blocage (`revision`).
    /// Revenir sur l'onglet ne recharge pas le feed, comme Instagram.
    func appear(revision: Int) async {
        guard revision != loadedRevision || state != .loaded else { return }
        loadedRevision = revision
        await load()
    }

    /// Tirer pour rafraîchir, ou après une publication : feed rechargé, posts anciens repliés.
    func refresh() async {
        await load()
        if state == .loaded {
            isShowingOlder = false
        }
    }

    /// Première page ; un rafraîchissement garde le feed affiché pendant le chargement et en cas d'échec.
    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await service.listFeed(cursor: nil)
            likes.record(page.items)
            commentCounts.record(page.items)
            loadedPosts = page.items
            nextCursor = page.nextCursor
            loadMoreFailed = false
            state = .loaded
            prefetch(page.items.prefix(Self.prefetchDistance))
        } catch {
            if state != .loaded {
                state = .failed(message: "Impossible de charger le feed. Vérifiez votre connexion et réessayez.")
            }
        }
    }

    /// Page suivante.
    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await service.listFeed(cursor: cursor)
            likes.record(page.items)
            commentCounts.record(page.items)
            let known = Set(loadedPosts.map(\.id))
            loadedPosts += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
            loadMoreFailed = false
        } catch {
            loadMoreFailed = true
        }
    }

    /// Un post apparaît : préchargement des photos des suivants, puis page suivante à l'approche du bas
    /// (sauf si les posts anciens sont repliés et que les récents sont tous chargés).
    func postAppeared(_ post: Post) async {
        let visible = visiblePosts
        guard let index = visible.firstIndex(where: { $0.id == post.id }) else { return }
        prefetch(visible.dropFirst(index + 1).prefix(Self.prefetchDistance))
        guard hasMore, index >= visible.count - 4, isShowingOlder || olderPosts.isEmpty else { return }
        await loadMore()
    }

    /// « Afficher les publications plus anciennes » : déplie la suite du feed, chargée si besoin.
    func showOlder() async {
        isShowingOlder = true
        if olderPosts.isEmpty {
            await loadMore()
        }
    }

    /// Supprime un de mes posts (confirmé par l'utilisateur) : il disparaît tout de suite de tous les écrans,
    /// et réapparaît si l'API échoue (`PostDeletionStore`).
    func delete(_ post: Post) async {
        guard canDelete(post) else { return }
        await deletions.delete(postId: post.id)
    }

    /// Le post avec son dernier état de like et son nombre de commentaires, partagés avec les autres écrans.
    func displayed(_ post: Post) -> Post {
        commentCounts.displayed(likes.displayed(post))
    }

    /// Bouton J'aime : like ou unlike, affiché tout de suite (optimiste).
    func toggleLike(_ post: Post) async {
        await handle(likes.toggleLike(post), for: post)
    }

    /// Double tap sur la photo : like seulement, jamais d'unlike (comme Instagram).
    func likeFromDoubleTap(_ post: Post) async {
        await handle(likes.likeFromDoubleTap(post), for: post)
    }

    private func handle(_ outcome: LikeOutcome?, for post: Post) {
        switch outcome {
        case let .reverted(message):
            likeErrorMessage = message
        case .postGone:
            loadedPosts.removeAll { $0.id == post.id }
        case .confirmed, nil:
            break
        }
    }

    /// Variante `large`, celle qu'affiche `PostView` : `LazyImage` la retrouve dans le cache.
    private func prefetch(_ posts: some Sequence<Post>) {
        let urls = posts.flatMap { $0.media.map(\.variants.large) }
        if !urls.isEmpty {
            prefetcher.prefetch(urls)
        }
    }
}

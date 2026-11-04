import Foundation
import Observation

/// Onglet Reels : sous-onglets « Reels » (chronologique) et « Amis » (reels créés, aimés ou commentés par
/// mes abonnés mutuels, ADR-029) ; likes et compteurs partagés avec le reste de l'app.
@Observable
final class ReelsViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed
    }

    enum Tab: Equatable, CaseIterable {
        case reels
        case friends
    }

    private(set) var state: State = .loading
    private(set) var tab: Tab = .reels
    private(set) var posts: [Post] = []
    private(set) var isLoadingMore = false
    private(set) var loadMoreFailed = false
    var errorMessage: String?
    private var nextCursor: String?
    private var loadedRevision: Int?
    private var generation = 0
    private let service: any PostService
    private let likes: LikeSynchronizer
    private let commentCounts: CommentCountStore

    init(posts: any PostService, likes: LikeSynchronizer, commentCounts: CommentCountStore) {
        service = posts
        self.likes = likes
        self.commentCounts = commentCounts
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    func appear(revision: Int) async {
        guard loadedRevision != revision || state != .loaded else { return }
        loadedRevision = revision
        await load()
    }

    /// Change de sous-onglet : la liste repart de la première page.
    func select(_ tab: Tab) async {
        guard tab != self.tab else { return }
        self.tab = tab
        posts = []
        nextCursor = nil
        await load()
    }

    func load() async {
        generation += 1
        let requestGeneration = generation
        state = .loading
        do {
            let page = try await fetch(cursor: nil)
            guard requestGeneration == generation else { return }
            record(page)
            posts = page.items
            loadMoreFailed = false
            state = .loaded
        } catch {
            guard requestGeneration == generation else { return }
            state = .failed
        }
    }

    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        let requestGeneration = generation
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await fetch(cursor: cursor)
            guard requestGeneration == generation else { return }
            record(page)
            let known = Set(posts.map(\.id))
            posts += page.items.filter { !known.contains($0.id) }
            loadMoreFailed = false
        } catch {
            guard requestGeneration == generation else { return }
            loadMoreFailed = true
        }
    }

    func selected(_ id: String?) async {
        guard let index = posts.firstIndex(where: { $0.id == id }), index >= posts.count - 3,
              !loadMoreFailed else { return }
        await loadMore()
    }

    /// Feuille des amis d'un reel de l'onglet Amis.
    func friendInteractions(of reelId: String) -> FriendInteractionsViewModel {
        FriendInteractionsViewModel(reelId: reelId, posts: service)
    }

    func displayed(_ post: Post) -> Post {
        commentCounts.displayed(likes.displayed(post))
    }

    func toggleLike(_ post: Post) async {
        switch await likes.toggleLike(post) {
        case let .reverted(message): errorMessage = message
        case .postGone: posts.removeAll { $0.id == post.id }
        case .confirmed, nil: break
        }
    }

    private func fetch(cursor: String?) async throws(PostServiceError) -> PostPage {
        switch tab {
        case .reels: try await service.listReelsFeed(cursor: cursor)
        case .friends: try await service.listFriendsReels(cursor: cursor)
        }
    }

    private func record(_ page: PostPage) {
        likes.record(page.items)
        commentCounts.record(page.items)
        nextCursor = page.nextCursor
    }
}

extension Post {
    /// Phrase de l'onglet Amis : « léa a aimé », « léa et 2 autres amis ont interagi » ; `nil` hors de
    /// l'onglet Amis. Les amis bloqués depuis le chargement (`hiding`) ne sont ni nommés ni comptés.
    func friendsSummary(hiding hidden: Set<String> = []) -> String? {
        let visible = friendInteractions.filter { !hidden.contains($0.user.id) }
        guard let first = visible.first else { return nil }
        let hiddenCount = friendInteractions.count - visible.count
        let others = friendInteractionCount - hiddenCount - 1
        if others > 0 {
            return "\(first.user.username) et \(others) \(others == 1 ? "autre ami" : "autres amis") ont interagi"
        }
        return "\(first.user.username) \(first.verb)"
    }
}

extension FriendInteraction {
    /// « a aimé », « a commenté », « a créé » ; plusieurs interactions → « a interagi ».
    var verb: String {
        guard kinds.count == 1, let kind = kinds.first else { return "a interagi" }
        return switch kind {
        case .created: "a créé"
        case .liked: "a aimé"
        case .commented: "a commenté"
        }
    }

    /// Ligne de la feuille des amis : « a aimé », « a créé et commenté : texte »…
    var detail: String {
        let participles = kinds.map { kind in
            switch kind {
            case .created: "créé"
            case .liked: "aimé"
            case .commented: "commenté"
            }
        }
        guard let last = participles.last else { return "a interagi" }
        let joined = participles.count > 1 ? participles.dropLast().joined(separator: ", ") + " et " + last : last
        guard kinds.contains(.commented), let commentText else { return "a \(joined)" }
        return "a \(joined) : \(commentText)"
    }
}

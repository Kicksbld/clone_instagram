import Foundation
import Observation

/// Onglet Reels : pages chronologiques, likes et compteurs partagés avec le reste de l'app.
@Observable
final class ReelsViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed
    }

    private(set) var state: State = .loading
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

    func load() async {
        generation += 1
        let requestGeneration = generation
        state = .loading
        do {
            let page = try await service.listReelsFeed(cursor: nil)
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
            let page = try await service.listReelsFeed(cursor: cursor)
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

    private func record(_ page: PostPage) {
        likes.record(page.items)
        commentCounts.record(page.items)
        nextCursor = page.nextCursor
    }
}

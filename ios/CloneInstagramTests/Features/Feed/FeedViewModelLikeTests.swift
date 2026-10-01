import Foundation
import Testing
@testable import CloneInstagram

/// J'aime dans le feed : mise à jour optimiste, retour arrière, double tap.
struct FeedViewModelLikeTests {
    private let service = FakePostService()
    private let engagement = FakeEngagementService()
    /// Partagés par tous les écrans, comme dans l'app.
    private let likes: LikeSynchronizer

    init() {
        likes = LikeSynchronizer(service: engagement)
    }

    private func makeViewModel() -> FeedViewModel {
        FeedViewModel(
            viewerId: "0199a1b2-5eed-7000-8000-000000000001",
            posts: service,
            likes: likes,
            prefetcher: FakeImagePrefetcher()
        )
    }

    private func post(_ number: Int) -> Post {
        .fixture(id: "0199a1b2-0000-7000-a000-\(String(format: "%012d", number))", authorId: "0199a1b2-5eed-7000-8000-000000000002")
    }

    private func page(_ posts: [Post]) -> Result<PostPage, PostServiceError> {
        .success(PostPage(items: posts, nextCursor: nil))
    }

    private func likeOf(_ viewModel: FeedViewModel, _ id: String) -> LikeStatus? {
        viewModel.posts.first { $0.id == id }.map { viewModel.displayed($0).likeStatus }
    }

    @Test func `bouton J'aime : optimiste, puis compteur de l'API`() async {
        let target = post(1)
        service.feedResults = [page([target, post(2)])]
        engagement.results = [.success(LikeStatus(isLiked: true, likeCount: 3))]
        let viewModel = makeViewModel()
        await viewModel.load()
        var duringCall: LikeStatus?
        engagement.duringCall = { duringCall = likeOf(viewModel, target.id) }

        await viewModel.toggleLike(target)

        #expect(duringCall == LikeStatus(isLiked: true, likeCount: 1))
        #expect(likeOf(viewModel, target.id) == LikeStatus(isLiked: true, likeCount: 3))
        #expect(likeOf(viewModel, post(2).id) == LikeStatus(isLiked: false, likeCount: 0))
    }

    @Test func `deuxième tap : unlike`() async {
        let target = post(1)
        service.feedResults = [page([target])]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.toggleLike(target)
        await viewModel.toggleLike(target)

        #expect(engagement.calls.map(\.isLiking) == [true, false])
        #expect(likeOf(viewModel, target.id) == LikeStatus(isLiked: false, likeCount: 0))
    }

    @Test func `échec du like : retour arrière et message`() async {
        let target = post(1)
        service.feedResults = [page([target])]
        engagement.results = [.failure(.rateLimited(retryAfter: 10))]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.toggleLike(target)

        #expect(likeOf(viewModel, target.id) == LikeStatus(isLiked: false, likeCount: 0))
        #expect(viewModel.likeErrorMessage != nil)
    }

    @Test func `post devenu invisible (404) : retiré du feed`() async {
        let target = post(1)
        service.feedResults = [page([target, post(2)])]
        engagement.results = [.failure(.postNotFound)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.likeFromDoubleTap(target)

        #expect(viewModel.posts.map(\.id) == [post(2).id])
        #expect(viewModel.likeErrorMessage == nil)
    }

    @Test func `double tap sur un post déjà aimé : rien n'est envoyé`() async {
        var target = post(1)
        target.isLiked = true
        target.likeCount = 2
        service.feedResults = [page([target])]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.likeFromDoubleTap(target)

        #expect(engagement.calls.isEmpty)
        #expect(likeOf(viewModel, target.id) == LikeStatus(isLiked: true, likeCount: 2))
    }

    @Test func `like donné dans le détail : visible dans le feed, comme Instagram`() async {
        let target = post(1)
        service.feedResults = [page([target])]
        service.fetchResults = [.success(target)]
        engagement.results = [.success(LikeStatus(isLiked: true, likeCount: 5))]
        let feed = makeViewModel()
        await feed.load()
        let detail = PostDetailViewModel(
            postId: target.id,
            viewerId: "0199a1b2-5eed-7000-8000-000000000001",
            posts: service,
            likes: likes
        )
        await detail.load()

        await detail.toggleLike()

        #expect(likeOf(feed, target.id) == LikeStatus(isLiked: true, likeCount: 5))
    }

    @Test func `feed rechargé : l'état de l'API devient le dernier connu`() async {
        let target = post(1)
        var likedElsewhere = target
        likedElsewhere.isLiked = true
        likedElsewhere.likeCount = 8
        service.feedResults = [page([target]), page([likedElsewhere])]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.refresh()

        #expect(likeOf(viewModel, target.id) == LikeStatus(isLiked: true, likeCount: 8))
    }
}

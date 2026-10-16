import Testing
@testable import CloneInstagram

struct PostDetailViewModelTests {
    private static let viewer = "0199a1b2-5eed-7000-8000-000000000001"
    private let service = FakePostService()
    private let engagement = FakeEngagementService()
    private var likes: LikeSynchronizer {
        LikeSynchronizer(service: engagement)
    }

    private let deletions: PostDeletionStore

    init() {
        deletions = PostDeletionStore(service: service)
    }

    @Test func `post chargé`() async {
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)

        await viewModel.load()

        #expect(viewModel.state == .loaded(.fixture(id: "p1")))
    }

    @Test func `post invisible ou supprimé → notFound`() async {
        service.fetchResults = [.failure(.postNotFound)]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)

        await viewModel.load()

        #expect(viewModel.state == .notFound)
    }

    @Test func `API injoignable → message, puis réessai`() async {
        service.fetchResults = [.failure(.unreachable)]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("État attendu : failed")
            return
        }

        await viewModel.load()
        #expect(viewModel.state == .loaded(.fixture(id: "p1")))
    }

    @Test func `menu Supprimer : seulement sur mes posts`() async {
        let mine = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)
        let other = PostDetailViewModel(postId: "p1", viewerId: "autre", posts: service, likes: likes, deletions: deletions)

        #expect(!mine.canDelete)
        await mine.load()
        await other.load()

        #expect(mine.canDelete)
        #expect(!other.canDelete)
    }

    @Test func `suppression : post masqué partout, puis supprimé`() async {
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)
        await viewModel.load()
        var hiddenDuringCall: Bool?
        service.duringDelete = { hiddenDuringCall = deletions.isDeleted("p1") }

        await viewModel.delete()

        #expect(hiddenDuringCall == true)
        #expect(service.deleted == ["p1"])
        #expect(deletions.isDeleted("p1"))
    }

    @Test func `post déjà supprimé (404) : suppression considérée comme réussie`() async {
        service.deleteErrors = [.postNotFound]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)
        await viewModel.load()

        await viewModel.delete()

        #expect(deletions.isDeleted("p1"))
        #expect(deletions.errorMessage == nil)
    }

    @Test func `suppression en échec : post réaffiché, message`() async {
        service.deleteErrors = [.unreachable]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)
        await viewModel.load()

        await viewModel.delete()

        #expect(!deletions.isDeleted("p1"))
        #expect(deletions.errorMessage != nil)
    }

    @Test func `post d'un autre : jamais supprimé`() async {
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: "autre", posts: service, likes: likes, deletions: deletions)
        await viewModel.load()

        await viewModel.delete()

        #expect(service.deleted.isEmpty)
    }

    // MARK: - J'aime

    private func loadedViewModel(_ post: Post = .fixture(id: "p1")) async -> PostDetailViewModel {
        service.fetchResults = [.success(post)]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service, likes: likes, deletions: deletions)
        await viewModel.load()
        return viewModel
    }

    private func likeOf(_ viewModel: PostDetailViewModel) -> LikeStatus? {
        guard case let .loaded(post) = viewModel.state else { return nil }
        return viewModel.displayed(post).likeStatus
    }

    @Test func `bouton J'aime : cœur et compteur changent tout de suite, puis l'état de l'API`() async {
        var post = Post.fixture(id: "p1")
        post.likeCount = 4
        let viewModel = await loadedViewModel(post)
        engagement.results = [.success(LikeStatus(isLiked: true, likeCount: 9))]
        var duringCall: LikeStatus?
        engagement.duringCall = { duringCall = likeOf(viewModel) }

        await viewModel.toggleLike()

        #expect(duringCall == LikeStatus(isLiked: true, likeCount: 5))
        #expect(likeOf(viewModel) == LikeStatus(isLiked: true, likeCount: 9))
    }

    @Test func `échec : retour arrière et message`() async {
        let viewModel = await loadedViewModel()
        engagement.results = [.failure(.unreachable)]

        await viewModel.toggleLike()

        #expect(likeOf(viewModel) == LikeStatus(isLiked: false, likeCount: 0))
        #expect(viewModel.likeErrorMessage != nil)
    }

    @Test func `post devenu invisible (404) → notFound`() async {
        let viewModel = await loadedViewModel()
        engagement.results = [.failure(.postNotFound)]

        await viewModel.toggleLike()

        #expect(viewModel.state == .notFound)
    }

    @Test func `double tap : like, jamais d'unlike`() async {
        var liked = Post.fixture(id: "p1")
        liked.isLiked = true
        liked.likeCount = 1
        let viewModel = await loadedViewModel(liked)

        await viewModel.likeFromDoubleTap()

        #expect(engagement.calls.isEmpty)
        #expect(likeOf(viewModel) == LikeStatus(isLiked: true, likeCount: 1))
    }
}

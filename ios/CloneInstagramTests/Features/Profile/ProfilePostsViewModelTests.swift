import Testing
@testable import CloneInstagram

struct ProfilePostsViewModelTests {
    private let service = FakePostService()
    private let userId = "0199a1b2-5eed-7000-8000-000000000001"

    private func page(_ range: ClosedRange<Int>, next: String?) -> PostPage {
        PostPage(items: range.map { .fixture(id: "post-\($0)") }, nextCursor: next)
    }

    @Test func `première page puis suite par curseur, sans doublon`() async {
        service.listResults = [.success(page(1 ... 12, next: "c1")), .success(page(12 ... 13, next: nil))]
        let viewModel = ProfilePostsViewModel(userId: userId, posts: service)

        await viewModel.load()
        #expect(viewModel.state == .loaded)
        #expect(viewModel.hasMore)
        #expect(viewModel.shouldLoadMore(after: .fixture(id: "post-7")))
        #expect(!viewModel.shouldLoadMore(after: .fixture(id: "post-1")))

        await viewModel.loadMore()

        #expect(viewModel.posts.map(\.id) == (1 ... 13).map { "post-\($0)" })
        #expect(!viewModel.hasMore)
        #expect(service.listRequests == [.init(userId: userId, cursor: nil), .init(userId: userId, cursor: "c1")])
    }

    @Test func `échec du premier chargement : message et réessai possible`() async {
        service.listResults = [.failure(.unreachable)]
        let viewModel = ProfilePostsViewModel(userId: userId, posts: service)

        await viewModel.load()

        guard case .failed = viewModel.state else {
            Issue.record("État attendu : failed")
            return
        }
        await viewModel.load()
        #expect(viewModel.state == .loaded)
    }

    @Test func `échec de la suite : grille gardée, bouton pour réessayer`() async {
        service.listResults = [.success(page(1 ... 12, next: "c1")), .failure(.unreachable)]
        let viewModel = ProfilePostsViewModel(userId: userId, posts: service)
        await viewModel.load()

        await viewModel.loadMore()

        #expect(viewModel.posts.count == 12)
        #expect(viewModel.loadMoreFailed)
        #expect(viewModel.hasMore)
    }

    @Test func `rafraîchissement en échec : grille gardée`() async {
        service.listResults = [.success(page(1 ... 2, next: nil)), .failure(.unreachable)]
        let viewModel = ProfilePostsViewModel(userId: userId, posts: service)
        await viewModel.load()

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.posts.count == 2)
    }
}

import Testing
@testable import CloneInstagram

struct PostDetailViewModelTests {
    private let service = FakePostService()

    @Test func `post chargé`() async {
        let viewModel = PostDetailViewModel(postId: "p1", posts: service)

        await viewModel.load()

        #expect(viewModel.state == .loaded(.fixture(id: "p1")))
    }

    @Test func `post invisible ou supprimé → notFound`() async {
        service.fetchResults = [.failure(.postNotFound)]
        let viewModel = PostDetailViewModel(postId: "p1", posts: service)

        await viewModel.load()

        #expect(viewModel.state == .notFound)
    }

    @Test func `API injoignable → message, puis réessai`() async {
        service.fetchResults = [.failure(.unreachable)]
        let viewModel = PostDetailViewModel(postId: "p1", posts: service)

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("État attendu : failed")
            return
        }

        await viewModel.load()
        #expect(viewModel.state == .loaded(.fixture(id: "p1")))
    }
}

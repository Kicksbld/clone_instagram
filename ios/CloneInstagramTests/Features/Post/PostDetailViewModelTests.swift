import Testing
@testable import CloneInstagram

struct PostDetailViewModelTests {
    private static let viewer = "0199a1b2-5eed-7000-8000-000000000001"
    private let service = FakePostService()

    @Test func `post chargé`() async {
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service)

        await viewModel.load()

        #expect(viewModel.state == .loaded(.fixture(id: "p1")))
    }

    @Test func `post invisible ou supprimé → notFound`() async {
        service.fetchResults = [.failure(.postNotFound)]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service)

        await viewModel.load()

        #expect(viewModel.state == .notFound)
    }

    @Test func `API injoignable → message, puis réessai`() async {
        service.fetchResults = [.failure(.unreachable)]
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service)

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("État attendu : failed")
            return
        }

        await viewModel.load()
        #expect(viewModel.state == .loaded(.fixture(id: "p1")))
    }

    @Test func `menu Supprimer : seulement sur mes posts`() async {
        let mine = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service)
        let other = PostDetailViewModel(postId: "p1", viewerId: "autre", posts: service)

        #expect(!mine.canDelete)
        await mine.load()
        await other.load()

        #expect(mine.canDelete)
        #expect(!other.canDelete)
    }

    @Test func `suppression réussie : post supprimé, profil prévenu`() async {
        var deletions = 0
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service) { deletions += 1 }
        await viewModel.load()

        let closed = await viewModel.delete()

        #expect(closed)
        #expect(service.deleted == ["p1"])
        #expect(deletions == 1)
    }

    @Test func `post déjà supprimé (404) : suppression considérée comme réussie`() async {
        service.deleteErrors = [.postNotFound]
        var deletions = 0
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service) { deletions += 1 }
        await viewModel.load()

        #expect(await viewModel.delete())
        #expect(deletions == 1)
    }

    @Test func `suppression en échec : message, écran gardé`() async {
        service.deleteErrors = [.unreachable]
        var deletions = 0
        let viewModel = PostDetailViewModel(postId: "p1", viewerId: Self.viewer, posts: service) { deletions += 1 }
        await viewModel.load()

        #expect(await !viewModel.delete())
        #expect(viewModel.deleteErrorMessage != nil)
        #expect(deletions == 0)
    }
}

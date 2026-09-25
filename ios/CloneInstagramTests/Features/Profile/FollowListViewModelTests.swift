import Testing
@testable import CloneInstagram

struct FollowListViewModelTests {
    private static let viewerId = "0199a1b2-0000-7000-8000-000000000001"
    private static let ownerId = "0199a1b2-5eed-7000-8000-000000000001"
    private let social = FakeSocialService()

    private func makeViewModel() -> FollowListViewModel {
        FollowListViewModel(kind: .followers, userId: Self.ownerId, viewerId: Self.viewerId, social: social)
    }

    private func user(_ index: Int, isPrivate: Bool = false, isFollowing: Bool = false) -> UserSummary {
        .fixture(id: "id-\(index)", username: "u\(index)", isPrivate: isPrivate, isFollowing: isFollowing)
    }

    @Test func `première page puis page suivante avec le curseur`() async {
        social.listResults = [
            .success(UserPage(items: [user(1), user(2)], nextCursor: "c1")),
            .success(UserPage(items: [user(3)], nextCursor: nil)),
        ]
        let viewModel = makeViewModel()

        await viewModel.load()
        #expect(viewModel.hasMore)
        await viewModel.loadMore()
        await viewModel.loadMore()

        #expect(viewModel.users.map(\.username) == ["u1", "u2", "u3"])
        #expect(!viewModel.hasMore)
        #expect(social.listRequests == [
            .init(kind: .followers, userId: Self.ownerId, cursor: nil),
            .init(kind: .followers, userId: Self.ownerId, cursor: "c1"),
        ])
    }

    @Test func `liste d'un compte privé non suivi → indisponible`() async {
        social.listResults = [.failure(.userNotFound)]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .notFound)
    }

    @Test func `erreur puis réessai`() async {
        social.listResults = [.failure(.unreachable), .success(UserPage(items: [user(1)], nextCursor: nil))]
        let viewModel = makeViewModel()

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("erreur attendue")
            return
        }
        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.users.count == 1)
    }

    @Test func `suivre depuis la liste : optimiste, retour arrière en cas d'échec`() async {
        social.listResults = [.success(UserPage(items: [user(1), user(2)], nextCursor: nil))]
        social.followResults = [.success(FollowStatus(isFollowing: true, followerCount: 1)), .failure(.unreachable)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.setFollowing(true, for: user(1))
        await viewModel.setFollowing(true, for: user(2))

        #expect(viewModel.users.map(\.isFollowing) == [true, false])
        #expect(viewModel.actionErrorMessage != nil)
    }

    @Test func `pas de bouton sur moi ni sur un compte privé non suivi`() {
        let viewModel = makeViewModel()

        #expect(viewModel.canFollow(user(1)))
        #expect(!viewModel.canFollow(user(1, isPrivate: true)))
        #expect(viewModel.canFollow(user(1, isPrivate: true, isFollowing: true)))
        #expect(!viewModel.canFollow(.fixture(id: Self.viewerId)))
    }
}

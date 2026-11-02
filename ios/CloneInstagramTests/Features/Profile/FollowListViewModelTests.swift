import Testing
@testable import CloneInstagram

struct FollowListViewModelTests {
    private static let viewerId = "0199a1b2-0000-7000-8000-000000000001"
    private static let ownerId = "0199a1b2-5eed-7000-8000-000000000001"
    private let social = FakeSocialService()
    private let analytics = FakeAnalyticsService()
    private let follows: FollowStore

    init() {
        follows = FollowStore(service: social, analytics: analytics)
    }

    private func makeViewModel() -> FollowListViewModel {
        FollowListViewModel(kind: .followers, userId: Self.ownerId, viewerId: Self.viewerId, social: social, follows: follows)
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
        #expect(analytics.events == [.userFollowed(.list)])
    }

    @Test func `suivre : bouton changé pendant l'appel, sans attendre l'API`() async {
        social.listResults = [.success(UserPage(items: [user(1)], nextCursor: nil))]
        let viewModel = makeViewModel()
        await viewModel.load()
        var duringCall: Bool?
        social.duringFollow = { duringCall = viewModel.users.first?.isFollowing }

        await viewModel.setFollowing(true, for: user(1))

        #expect(duringCall == true)
    }

    @Test func `un tap pendant l'appel : le dernier choix gagne`() async {
        social.listResults = [.success(UserPage(items: [user(1)], nextCursor: nil))]
        let viewModel = makeViewModel()
        await viewModel.load()
        social.duringFollow = { await viewModel.setFollowing(false, for: user(1, isFollowing: true)) }

        await viewModel.setFollowing(true, for: user(1))

        #expect(social.follows == ["id-1"])
        #expect(social.unfollows == ["id-1"])
        #expect(viewModel.users.first?.isFollowing == false)
    }

    @Test func `compte devenu invisible pendant le follow → retiré de la liste`() async {
        social.listResults = [.success(UserPage(items: [user(1), user(2)], nextCursor: nil))]
        social.followResults = [.failure(.userNotFound)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.setFollowing(true, for: user(1))

        #expect(viewModel.users.map(\.id) == ["id-2"])
    }

    @Test func `suivi depuis un autre écran : la liste affiche l'état partagé`() async {
        social.listResults = [.success(UserPage(items: [user(1)], nextCursor: nil))]
        let viewModel = makeViewModel()
        await viewModel.load()

        _ = await follows.setFollowing(true, userId: "id-1", current: FollowState(user(1)), isPrivate: false, source: .profile)

        #expect(viewModel.users.first?.isFollowing == true)
    }

    @Test func `bouton Suivre sur tout compte sauf moi, compte privé compris (demande)`() {
        let viewModel = makeViewModel()

        #expect(viewModel.canFollow(user(1)))
        #expect(viewModel.canFollow(user(1, isPrivate: true)))
        #expect(viewModel.canFollow(user(1, isPrivate: true, isFollowing: true)))
        #expect(!viewModel.canFollow(.fixture(id: Self.viewerId)))
    }

    // MARK: - Retirer un abonné (T20)

    private func myFollowers() -> FollowListViewModel {
        FollowListViewModel(kind: .followers, userId: Self.viewerId, viewerId: Self.viewerId, social: social, follows: follows)
    }

    @Test func `bouton Supprimer seulement dans la liste de mes propres abonnés`() {
        #expect(myFollowers().canRemoveFollower(user(1)))
        #expect(!makeViewModel().canRemoveFollower(user(1)))
        let following = FollowListViewModel(
            kind: .following, userId: Self.viewerId, viewerId: Self.viewerId, social: social, follows: follows
        )
        #expect(!following.canRemoveFollower(user(1)))
    }

    @Test func `retirer un abonné : la ligne disparaît tout de suite`() async {
        social.listResults = [.success(UserPage(items: [user(1), user(2)], nextCursor: nil))]
        let viewModel = myFollowers()
        await viewModel.load()
        var duringCall: [String]?
        social.duringFollowRequest = { duringCall = viewModel.users.map(\.id) }

        await viewModel.removeFollower(user(1))

        #expect(duringCall == ["id-2"])
        #expect(social.removedFollowers == ["id-1"])
        #expect(viewModel.users.map(\.id) == ["id-2"])
        #expect(viewModel.actionErrorMessage == nil)
    }

    @Test func `retrait en échec : la ligne revient avec un message`() async {
        social.listResults = [.success(UserPage(items: [user(1)], nextCursor: nil))]
        social.followRequestErrors = [.unreachable]
        let viewModel = myFollowers()
        await viewModel.load()

        await viewModel.removeFollower(user(1))

        #expect(viewModel.users.map(\.id) == ["id-1"])
        #expect(viewModel.actionErrorMessage == "Impossible de supprimer cet abonné. Vérifiez votre connexion et réessayez.")
    }

    @Test func `compte devenu invisible (404) : la ligne ne revient pas`() async {
        social.listResults = [.success(UserPage(items: [user(1)], nextCursor: nil))]
        social.followRequestErrors = [.userNotFound]
        let viewModel = myFollowers()
        await viewModel.load()

        await viewModel.removeFollower(user(1))

        #expect(viewModel.users.isEmpty)
        #expect(viewModel.actionErrorMessage == nil)
    }

    @Test func `compte privé dans une liste : « Demandé » puis annulation`() async {
        social.listResults = [.success(UserPage(items: [user(1, isPrivate: true)], nextCursor: nil))]
        social.followResults = [
            .success(FollowStatus(isFollowing: false, followerCount: 0, isRequested: true)),
            .success(FollowStatus(isFollowing: false, followerCount: 0)),
        ]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.setFollowing(true, for: user(1, isPrivate: true))
        #expect(viewModel.users.first?.isRequested == true)
        #expect(viewModel.users.first?.isFollowing == false)

        await viewModel.setFollowing(false, for: user(1, isPrivate: true))
        #expect(viewModel.users.first?.isRequested == false)
        #expect(social.unfollows == ["id-1"])
    }
}

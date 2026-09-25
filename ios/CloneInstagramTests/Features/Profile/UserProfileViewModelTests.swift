import Testing
@testable import CloneInstagram

struct UserProfileViewModelTests {
    private static let viewerId = "0199a1b2-0000-7000-8000-000000000001"
    private let identity = FakeIdentityService()
    private let social = FakeSocialService()

    private func makeViewModel(onFollowChange: @escaping () async -> Void = {}) -> UserProfileViewModel {
        UserProfileViewModel(
            username: "lea.martin",
            viewerId: Self.viewerId,
            identity: identity,
            social: social,
            onFollowChange: onFollowChange
        )
    }

    private func loadedProfile(_ viewModel: UserProfileViewModel) -> UserProfile? {
        if case let .loaded(profile) = viewModel.state {
            profile
        } else {
            nil
        }
    }

    @Test func `profil chargé par son username`() async {
        identity.userProfileResults = [.success(.fixture(followsMe: true))]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(identity.fetchedUsernames == ["lea.martin"])
        #expect(viewModel.state == .loaded(.fixture(followsMe: true)))
    }

    @Test func `compte privé non suivi : contenus non visibles`() async {
        identity.userProfileResults = [.success(.fixture(isPrivate: true, canViewContent: false))]
        let viewModel = makeViewModel()

        await viewModel.load()

        guard case let .loaded(profile) = viewModel.state else {
            Issue.record("profil attendu")
            return
        }
        #expect(!profile.canViewContent)
    }

    @Test(arguments: [IdentityServiceError.userNotFound, .invalidInput])
    func `profil introuvable ou invisible → page indisponible`(error: IdentityServiceError) async {
        identity.userProfileResults = [.failure(error)]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .notFound)
    }

    @Test func `erreur réseau puis réessai`() async {
        identity.userProfileResults = [.failure(.unreachable), .success(.fixture())]
        let viewModel = makeViewModel()

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("erreur attendue")
            return
        }

        await viewModel.load()
        #expect(viewModel.state == .loaded(.fixture()))
    }

    @Test func `rafraîchissement en échec : message d'erreur`() async {
        identity.userProfileResults = [.success(.fixture()), .failure(.unreachable)]
        let viewModel = makeViewModel()

        await viewModel.load()
        await viewModel.load()

        guard case .failed = viewModel.state else {
            Issue.record("erreur attendue")
            return
        }
    }

    @Test func `suivre : mise à jour optimiste, puis compteur de l'API et rappel`() async {
        identity.userProfileResults = [.success(.fixture())]
        social.followResults = [.success(FollowStatus(isFollowing: true, followerCount: 10))]
        var changes = 0
        let viewModel = makeViewModel { changes += 1 }
        await viewModel.load()

        await viewModel.follow()

        #expect(social.follows == ["0199a1b2-5eed-7000-8000-000000000001"])
        #expect(loadedProfile(viewModel)?.isFollowing == true)
        #expect(loadedProfile(viewModel)?.followerCount == 10)
        #expect(changes == 1)
    }

    @Test(arguments: [SocialServiceError.unreachable, .accountPrivate])
    func `suivre en échec : retour arrière et message`(error: SocialServiceError) async {
        identity.userProfileResults = [.success(.fixture())]
        social.followResults = [.failure(error)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.follow()

        #expect(viewModel.state == .loaded(.fixture()))
        #expect(viewModel.followErrorMessage != nil)
    }

    @Test func `ne plus suivre : compteur décrémenté`() async {
        identity.userProfileResults = [.success(.fixture(isFollowing: true))]
        social.followResults = [.success(FollowStatus(isFollowing: false, followerCount: 3))]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.unfollow()

        #expect(social.unfollows.count == 1)
        #expect(loadedProfile(viewModel)?.isFollowing == false)
        #expect(loadedProfile(viewModel)?.followerCount == 3)
    }

    @Test func `compte devenu invisible pendant le follow → page indisponible`() async {
        identity.userProfileResults = [.success(.fixture())]
        social.followResults = [.failure(.userNotFound)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.follow()

        #expect(viewModel.state == .notFound)
    }

    @Test func `pas de bouton Suivre sur un compte privé non suivi ni sur moi`() {
        let viewModel = makeViewModel()

        #expect(viewModel.canFollow(.fixture()))
        #expect(!viewModel.canFollow(.fixture(isPrivate: true, canViewContent: false)))
        #expect(viewModel.canFollow(.fixture(isPrivate: true, isFollowing: true)))
        let myself = UserProfile(
            id: Self.viewerId, username: "killian", fullName: "K", bio: "", isPrivate: false,
            followerCount: 0, followingCount: 0, postCount: 0, avatar: nil,
            isFollowing: false, followsMe: false, canViewContent: true
        )
        #expect(!viewModel.canFollow(myself))
    }
}

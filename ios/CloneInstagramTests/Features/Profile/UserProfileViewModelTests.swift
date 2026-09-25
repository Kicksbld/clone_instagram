import Testing
@testable import CloneInstagram

struct UserProfileViewModelTests {
    private let identity = FakeIdentityService()

    private func makeViewModel() -> UserProfileViewModel {
        UserProfileViewModel(username: "lea.martin", identity: identity)
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
}

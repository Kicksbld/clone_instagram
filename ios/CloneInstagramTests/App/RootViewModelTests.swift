import Testing
@testable import CloneInstagram

struct RootViewModelTests {
    @Test func `profil modifié depuis l'accueil → accueil à jour ; ignoré hors de l'accueil`() async {
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture())]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)
        await viewModel.start()
        var updated = Profile.fixture(bio: "Dev")
        updated.avatar = .fixture

        viewModel.updateProfile(updated)
        #expect(viewModel.route == .home(updated))

        await viewModel.signOut()
        viewModel.updateProfile(updated)
        #expect(viewModel.route == .welcome)
    }

    @Test func `sans session → bienvenue`() async {
        let viewModel = RootViewModel(auth: FakeAuthService(), identity: FakeIdentityService())

        await viewModel.start()

        #expect(viewModel.route == .welcome)
    }

    @Test func `session et profil → accueil`() async {
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture())]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)

        await viewModel.start()

        #expect(viewModel.route == .home(.fixture()))
    }

    @Test(arguments: [AuthProvider.email, .apple])
    func `session sans profil → reprise de l'onboarding`(provider: AuthProvider) async {
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: provider), identity: FakeIdentityService())

        await viewModel.start()

        #expect(viewModel.route == .onboarding(.resume(provider)))
    }

    @Test func `jeton refusé par l'API → déconnexion, bienvenue`() async {
        let auth = FakeAuthService(currentProvider: .email)
        let identity = FakeIdentityService()
        identity.meResults = [.failure(.unauthenticated)]
        let viewModel = RootViewModel(auth: auth, identity: identity)

        await viewModel.start()

        #expect(auth.calls == ["signOut"])
        #expect(viewModel.route == .welcome)
    }

    @Test func `API injoignable → erreur, puis nouvel essai`() async {
        let identity = FakeIdentityService()
        identity.meResults = [.failure(.unreachable), .success(.fixture())]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)

        await viewModel.start()
        guard case .failed = viewModel.route else {
            Issue.record("Route attendue : failed, obtenue : \(viewModel.route)")
            return
        }

        await viewModel.start()
        #expect(viewModel.route == .home(.fixture()))
    }

    @Test func `fin de l'onboarding → accueil ; déconnexion → bienvenue`() async {
        let auth = FakeAuthService(currentProvider: .email)
        let viewModel = RootViewModel(auth: auth, identity: FakeIdentityService())

        viewModel.finishOnboarding(with: .fixture())
        #expect(viewModel.route == .home(.fixture()))

        await viewModel.signOut()
        #expect(viewModel.route == .welcome)
        #expect(auth.currentProvider == nil)
    }
}

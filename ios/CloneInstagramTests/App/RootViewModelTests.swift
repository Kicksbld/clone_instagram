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

    @Test func `tirer pour rafraîchir → profil relu ; erreur → profil conservé`() async {
        let identity = FakeIdentityService()
        let refreshed = Profile.fixture(bio: "Nouvelle bio")
        identity.meResults = [.success(.fixture()), .success(refreshed), .failure(.unreachable)]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)
        await viewModel.start()

        await viewModel.refreshProfile()
        #expect(viewModel.route == .home(refreshed))

        await viewModel.refreshProfile()
        #expect(viewModel.route == .home(refreshed))
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

    @Test func `lancement identifie le profil ; déconnexion réinitialise les analytics (ADR-013)`() async {
        let analytics = FakeAnalyticsService()
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture())]
        let viewModel = RootViewModel(
            auth: FakeAuthService(currentProvider: .email),
            identity: identity,
            analytics: analytics
        )

        await viewModel.start()
        #expect(analytics.identified == [Profile.fixture().id])

        await viewModel.signOut()
        #expect(analytics.resetCount == 1)
    }

    @Test func `fin de l'onboarding → paywall → « Plus tard » → accueil ; déconnexion → bienvenue`() async {
        let auth = FakeAuthService(currentProvider: .email)
        let purchases = FakePurchaseService()
        let viewModel = RootViewModel(auth: auth, identity: FakeIdentityService(), purchases: purchases)

        viewModel.finishOnboarding(with: .fixture())
        #expect(viewModel.route == .paywall(.fixture()))

        viewModel.closePaywall()
        #expect(viewModel.route == .home(.fixture()))

        await viewModel.signOut()
        #expect(viewModel.route == .welcome)
        #expect(auth.currentProvider == nil)
        #expect(purchases.calls.last == "logOut")
    }

    @Test func `abonnement confirmé sur le paywall → accueil en plan plus`() {
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: FakeIdentityService())
        viewModel.finishOnboarding(with: .fixture())

        viewModel.updatePlan(.plusFixture)
        viewModel.closePaywall()

        guard case let .home(profile) = viewModel.route else {
            Issue.record("Route attendue : home, obtenue : \(viewModel.route)")
            return
        }
        #expect(profile.planStatus == .plusFixture)
    }

    @Test func `lancement → client RevenueCat rattaché au profil, plan relu par l'API`() async {
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture())]
        let purchases = FakePurchaseService()
        let subscriptions = FakeSubscriptionService()
        subscriptions.results = [.success(.plusFixture)]
        let viewModel = RootViewModel(
            auth: FakeAuthService(currentProvider: .email),
            identity: identity,
            purchases: purchases,
            subscriptions: subscriptions
        )

        await viewModel.start()

        #expect(purchases.calls == ["logIn(0199a1b2-0000-7000-8000-000000000001)"])
        var expected = Profile.fixture()
        expected.planStatus = .plusFixture
        #expect(viewModel.route == .home(expected))
    }

    @Test func `API injoignable au rafraîchissement → dernier plan conservé`() async {
        let identity = FakeIdentityService()
        var plus = Profile.fixture()
        plus.planStatus = .plusFixture
        identity.meResults = [.success(plus)]
        let subscriptions = FakeSubscriptionService()
        subscriptions.results = [.failure(.unreachable)]
        let viewModel = RootViewModel(
            auth: FakeAuthService(currentProvider: .email),
            identity: identity,
            subscriptions: subscriptions
        )

        await viewModel.start()

        #expect(viewModel.route == .home(plus))
    }

    @Test func `abonnement expiré → icône personnalisée retirée`() async {
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture())]
        let icons = FakeAppIconService()
        icons.current = .citron
        let viewModel = RootViewModel(
            auth: FakeAuthService(currentProvider: .email),
            identity: identity,
            subscriptions: FakeSubscriptionService(),
            appIcons: icons
        )

        await viewModel.start()

        #expect(icons.changes == [.standard])
    }

    @Test(arguments: [AccountStatus.suspended, .banned])
    func `compte suspendu ou banni → écran « Compte suspendu »`(status: AccountStatus) async {
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture(status: status))]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)

        await viewModel.start()

        #expect(viewModel.route == .suspended(.fixture(status: status)))
    }

    @Test func `refus account_suspended pendant la session → statut relu, écran « Compte suspendu »`() async {
        let identity = FakeIdentityService()
        identity.meResults = [.success(.fixture()), .success(.fixture(status: .suspended))]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)
        await viewModel.start()

        await viewModel.accountSuspended()

        #expect(viewModel.route == .suspended(.fixture(status: .suspended)))
    }

    @Test func `refus account_suspended hors de l'accueil → ignoré`() async {
        let viewModel = RootViewModel(auth: FakeAuthService(), identity: FakeIdentityService())
        await viewModel.start()

        await viewModel.accountSuspended()

        #expect(viewModel.route == .welcome)
    }

    @Test func `retour dans l'app : compte réactivé → accueil ; toujours suspendu → écran conservé`() async {
        let identity = FakeIdentityService()
        identity.meResults = [
            .success(.fixture(status: .suspended)),
            .success(.fixture(status: .banned)),
            .success(.fixture()),
            .success(.fixture()),
        ]
        let viewModel = RootViewModel(auth: FakeAuthService(currentProvider: .email), identity: identity)
        await viewModel.start()

        await viewModel.recheckSuspension()
        #expect(viewModel.route == .suspended(.fixture(status: .banned)))

        await viewModel.recheckSuspension()
        #expect(viewModel.route == .home(.fixture()))
    }
}

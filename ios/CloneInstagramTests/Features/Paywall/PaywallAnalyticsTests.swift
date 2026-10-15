import Testing
@testable import CloneInstagram

/// A/B test et entonnoir du paywall (ADR-013).
struct PaywallAnalyticsTests {
    private let purchases = FakePurchaseService()
    private let subscriptions = FakeSubscriptionService()
    private let analytics = FakeAnalyticsService()

    private func makeViewModel(
        source: PaywallSource = .onboarding,
        analytics: (any AnalyticsService)? = nil
    ) -> PaywallViewModel {
        PaywallViewModel(
            planStatus: .free,
            purchases: purchases,
            subscriptions: subscriptions,
            analytics: analytics ?? self.analytics,
            source: source,
            onPlanChanged: { _ in }
        )
    }

    @Test func `variante test lue sur PostHog → présentation test, paywall_viewed`() async {
        analytics.variant = .test
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.variant == .test)
        #expect(analytics.events == [.paywallViewed(.test, .onboarding)])
    }

    @Test func `variante par défaut : control`() async {
        let viewModel = makeViewModel(source: .settings)
        #expect(viewModel.variant == .control)

        await viewModel.load()

        #expect(viewModel.variant == .control)
        #expect(analytics.events == [.paywallViewed(.control, .settings)])
    }

    @Test func `sans PostHog (non configuré ou injoignable) → control, paywall utilisable`() async {
        subscriptions.results = [.success(.plusFixture)]
        let viewModel = makeViewModel(analytics: NoopAnalyticsService())

        await viewModel.load()
        await viewModel.subscribe()

        #expect(viewModel.variant == .control)
        #expect(viewModel.offer == .loaded(.fixture))
        #expect(viewModel.isSubscribed)
    }

    @Test func `offre indisponible : la vue est quand même comptée`() async {
        purchases.offerResult = .failure(.offerUnavailable)
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(analytics.events == [.paywallViewed(.control, .onboarding)])
    }

    @Test func `réessayer ne compte pas une nouvelle vue`() async {
        let viewModel = makeViewModel()

        await viewModel.load()
        await viewModel.load()

        #expect(analytics.events == [.paywallViewed(.control, .onboarding)])
    }

    @Test func `achat réussi → purchase_started puis purchase_completed, avec la variante`() async {
        analytics.variant = .test
        subscriptions.results = [.success(.plusFixture)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(analytics.events == [
            .paywallViewed(.test, .onboarding),
            .purchaseStarted(.test, .onboarding),
            .purchaseCompleted(.test, .onboarding),
        ])
    }

    @Test func `achat annulé → purchase_cancelled`() async {
        purchases.purchaseResult = .success(.cancelled)
        let viewModel = makeViewModel(source: .settings)
        await viewModel.load()

        await viewModel.subscribe()

        #expect(analytics.events.suffix(2) == [.purchaseStarted(.control, .settings), .purchaseCancelled(.control, .settings)])
    }

    @Test func `achat en échec → ni completed ni cancelled`() async {
        purchases.purchaseResult = .failure(.failed)
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(analytics.events.last == .purchaseStarted(.control, .onboarding))
    }
}

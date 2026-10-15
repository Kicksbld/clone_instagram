import Testing
@testable import CloneInstagram

struct PaywallViewModelTests {
    private let purchases = FakePurchaseService()
    private let subscriptions = FakeSubscriptionService()
    private let recorder = PlanRecorder()

    private func makeViewModel(planStatus: PlanStatus = .free) -> PaywallViewModel {
        PaywallViewModel(
            planStatus: planStatus,
            purchases: purchases,
            subscriptions: subscriptions,
            onPlanChanged: recorder.record
        )
    }

    @Test func `offre chargée depuis RevenueCat`() async {
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.offer == .loaded(.fixture))
    }

    @Test func `offre indisponible → état unavailable`() async {
        purchases.offerResult = .failure(.offerUnavailable)
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.offer == .unavailable)
    }

    @Test func `achat réussi → plan relu par l'API, plus transmis à l'app`() async {
        subscriptions.results = [.success(.plusFixture)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(purchases.calls == ["purchase($rc_monthly)"])
        #expect(viewModel.isSubscribed)
        #expect(recorder.statuses == [.plusFixture])
        #expect(viewModel.message == nil)
    }

    @Test func `achat annulé → aucun rafraîchissement, aucun message`() async {
        purchases.purchaseResult = .success(.cancelled)
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(subscriptions.refreshCount == 0)
        #expect(!viewModel.isSubscribed)
        #expect(viewModel.message == nil)
    }

    @Test func `achat réussi mais API encore free → pas abonné, message`() async {
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(!viewModel.isSubscribed)
        #expect(viewModel.message != nil)
    }

    @Test func `achat réussi mais API injoignable → pas abonné, message`() async {
        subscriptions.results = [.failure(.unreachable)]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(!viewModel.isSubscribed)
        #expect(recorder.statuses.isEmpty)
        #expect(viewModel.message != nil)
    }

    @Test(arguments: [PurchaseError.failed, .notAllowed])
    func `échec de l'achat → message, pas de rafraîchissement`(error: PurchaseError) async {
        purchases.purchaseResult = .failure(error)
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.subscribe()

        #expect(subscriptions.refreshCount == 0)
        #expect(viewModel.message != nil)
    }

    @Test func `restauration avec abonnement → plus`() async {
        subscriptions.results = [.success(.plusFixture)]
        let viewModel = makeViewModel()

        await viewModel.restore()

        #expect(purchases.calls == ["restore"])
        #expect(viewModel.isSubscribed)
        #expect(recorder.statuses == [.plusFixture])
    }

    @Test func `restauration sans achat → reste free, message`() async {
        let viewModel = makeViewModel()

        await viewModel.restore()

        #expect(!viewModel.isSubscribed)
        #expect(viewModel.message == "Aucun abonnement Clone Plus à restaurer pour ce compte Apple.")
    }

    @Test func `restauration impossible → message, pas de rafraîchissement`() async {
        purchases.restoreError = .failed
        let viewModel = makeViewModel()

        await viewModel.restore()

        #expect(subscriptions.refreshCount == 0)
        #expect(viewModel.message != nil)
    }

    @Test func `déjà abonné selon l'API → abonné sans achat`() {
        #expect(makeViewModel(planStatus: .plusFixture).isSubscribed)
    }
}

/// Plans transmis au reste de l'app par le paywall.
final class PlanRecorder {
    private(set) var statuses: [PlanStatus] = []

    func record(_ status: PlanStatus) {
        statuses.append(status)
    }
}

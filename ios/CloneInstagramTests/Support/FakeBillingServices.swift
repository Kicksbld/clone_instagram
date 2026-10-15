import Foundation
@testable import CloneInstagram

/// Faux `PurchaseService` : résultats programmables, appels enregistrés.
final class FakePurchaseService: PurchaseService {
    var offerResult: Result<PlusOffer, PurchaseError> = .success(.fixture)
    var purchaseResult: Result<PurchaseOutcome, PurchaseError> = .success(.purchased)
    var restoreError: PurchaseError?

    private(set) var calls: [String] = []

    func logIn(profileId: String) async {
        calls.append("logIn(\(profileId))")
    }

    func logOut() async {
        calls.append("logOut")
    }

    func plusOffer() async throws(PurchaseError) -> PlusOffer {
        try offerResult.get()
    }

    func purchase(_ offer: PlusOffer) async throws(PurchaseError) -> PurchaseOutcome {
        calls.append("purchase(\(offer.packageId))")
        return try purchaseResult.get()
    }

    func restore() async throws(PurchaseError) {
        calls.append("restore")
        if let restoreError {
            throw restoreError
        }
    }
}

/// Faux `SubscriptionService` : réponses successives ; `free` quand la liste est vide.
final class FakeSubscriptionService: SubscriptionService {
    var results: [Result<PlanStatus, SubscriptionServiceError>] = []
    private(set) var refreshCount = 0

    func refresh() async throws(SubscriptionServiceError) -> PlanStatus {
        refreshCount += 1
        guard !results.isEmpty else { return .free }
        return try results.removeFirst().get()
    }
}

/// Faux `AppIconService` : icône courante en mémoire.
final class FakeAppIconService: AppIconService {
    var current: AppIcon = .standard
    var error: AppIconError?
    private(set) var changes: [AppIcon] = []

    func setIcon(_ icon: AppIcon) async throws(AppIconError) {
        if let error {
            throw error
        }
        changes.append(icon)
        current = icon
    }
}

extension PlusOffer {
    static let fixture = PlusOffer(packageId: "$rc_monthly", price: "4,99 €", period: "mois")
}

extension PlanStatus {
    static let plusFixture = PlanStatus(plan: .plus, expiresAt: Date(timeIntervalSince1970: 1_793_000_000))
}

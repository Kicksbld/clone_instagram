import Foundation
import Observation

/// Paywall Clone Plus (ADR-012) : offre RevenueCat, achat, restauration. L'abonnement n'est
/// considéré comme actif que lorsque l'API renvoie le plan `plus`. Présentation selon la variante de
/// l'expérience PostHog, entonnoir `paywall_viewed` → `purchase_*` (ADR-013).
@Observable
final class PaywallViewModel {
    enum OfferState: Equatable {
        case loading
        case loaded(PlusOffer)
        case unavailable
    }

    private(set) var offer: OfferState = .loading
    /// Variante de l'A/B test ; `control` tant qu'elle n'est pas lue ou si PostHog est injoignable.
    private(set) var variant: PaywallVariant = .control
    /// Achat ou restauration en cours.
    private(set) var isWorking = false
    private(set) var planStatus: PlanStatus
    /// Message d'erreur ou d'information affiché en alerte.
    var message: String?

    var isSubscribed: Bool {
        planStatus.plan == .plus
    }

    private let purchases: any PurchaseService
    private let subscriptions: any SubscriptionService
    private let analytics: any AnalyticsService
    private let source: PaywallSource
    private let onPlanChanged: (PlanStatus) -> Void
    /// « Réessayer » relance `load()` sans compter une nouvelle vue.
    @ObservationIgnored private var hasTrackedView = false

    init(
        planStatus: PlanStatus,
        purchases: any PurchaseService,
        subscriptions: any SubscriptionService,
        analytics: any AnalyticsService = NoopAnalyticsService(),
        source: PaywallSource = .onboarding,
        onPlanChanged: @escaping (PlanStatus) -> Void
    ) {
        self.planStatus = planStatus
        self.purchases = purchases
        self.subscriptions = subscriptions
        self.analytics = analytics
        self.source = source
        self.onPlanChanged = onPlanChanged
    }

    /// Offre et variante lues en parallèle ; `paywall_viewed` une fois la variante connue (une seule fois).
    func load() async {
        offer = .loading
        let readVariant = Task { await analytics.paywallVariant() }
        do {
            offer = try await .loaded(purchases.plusOffer())
        } catch {
            offer = .unavailable
        }
        let variant = await readVariant.value
        self.variant = variant
        guard !hasTrackedView else { return }
        hasTrackedView = true
        analytics.track(.paywallViewed(variant, source))
    }

    func subscribe() async {
        guard case let .loaded(plusOffer) = offer, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        analytics.track(.purchaseStarted(variant, source))
        do {
            switch try await purchases.purchase(plusOffer) {
            case .cancelled:
                analytics.track(.purchaseCancelled(variant, source))
                return
            case .purchased:
                analytics.track(.purchaseCompleted(variant, source))
                if await confirmPlan() != .plus {
                    message = "Votre achat est enregistré, mais votre abonnement n'a pas encore pu être confirmé. "
                        + "Réessayez dans un instant avec « Restaurer les achats »."
                }
            }
        } catch .notAllowed {
            message = "Les achats intégrés sont désactivés sur cet appareil."
        } catch {
            message = "L'achat n'a pas abouti. Réessayez."
        }
    }

    func restore() async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await purchases.restore()
        } catch {
            message = "Impossible de restaurer vos achats. Vérifiez votre connexion et réessayez."
            return
        }
        switch await confirmPlan() {
        case .plus:
            message = "Votre abonnement Clone Plus a été restauré."
        case .free:
            message = "Aucun abonnement Clone Plus à restaurer pour ce compte Apple."
        case nil:
            message = "Impossible de confirmer votre abonnement. Vérifiez votre connexion et réessayez."
        }
    }

    /// Plan relu par l'API (`nil` si elle est injoignable) ; transmis au reste de l'app.
    private func confirmPlan() async -> Plan? {
        guard let status = try? await subscriptions.refresh() else { return nil }
        planStatus = status
        onPlanChanged(status)
        return status.plan
    }
}

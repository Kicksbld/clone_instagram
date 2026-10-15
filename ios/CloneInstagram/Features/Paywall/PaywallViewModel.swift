import Foundation
import Observation

/// Paywall Clone Plus (ADR-012) : offre RevenueCat, achat, restauration. L'abonnement n'est
/// considéré comme actif que lorsque l'API renvoie le plan `plus`.
@Observable
final class PaywallViewModel {
    enum OfferState: Equatable {
        case loading
        case loaded(PlusOffer)
        case unavailable
    }

    private(set) var offer: OfferState = .loading
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
    private let onPlanChanged: (PlanStatus) -> Void

    init(
        planStatus: PlanStatus,
        purchases: any PurchaseService,
        subscriptions: any SubscriptionService,
        onPlanChanged: @escaping (PlanStatus) -> Void
    ) {
        self.planStatus = planStatus
        self.purchases = purchases
        self.subscriptions = subscriptions
        self.onPlanChanged = onPlanChanged
    }

    func load() async {
        offer = .loading
        do {
            offer = try await .loaded(purchases.plusOffer())
        } catch {
            offer = .unavailable
        }
    }

    func subscribe() async {
        guard case let .loaded(plusOffer) = offer, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            switch try await purchases.purchase(plusOffer) {
            case .cancelled:
                return
            case .purchased:
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

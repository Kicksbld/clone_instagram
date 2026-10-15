import Foundation
import OSLog
import RevenueCat

/// `PurchaseService` sur le SDK `purchases-ios` (ADR-012).
struct RevenueCatPurchaseService: PurchaseService {
    private static let logger = Logger(subsystem: "com.killianboularand.cloneinstagram", category: "Billing")

    init(configuration: RevenueCatConfiguration) {
        if !Purchases.isConfigured {
            Purchases.configure(withAPIKey: configuration.apiKey)
        }
    }

    func logIn(profileId: String) async {
        do {
            _ = try await Purchases.shared.logIn(profileId)
        } catch {
            // Non bloquant : l'achat reste possible, RevenueCat rattache le client à la connexion suivante.
            Self.logger.error("RevenueCat logIn : \(error.localizedDescription, privacy: .public)")
        }
    }

    func logOut() async {
        // Client anonyme (jamais connecté) : RevenueCat refuse la déconnexion, sans conséquence.
        guard !Purchases.shared.isAnonymous else { return }
        _ = try? await Purchases.shared.logOut()
    }

    func plusOffer() async throws(PurchaseError) -> PlusOffer {
        let package = try await currentPackage()
        return PlusOffer(
            packageId: package.identifier,
            price: package.storeProduct.localizedPriceString,
            period: Self.periodLabel(package.storeProduct.subscriptionPeriod)
        )
    }

    func purchase(_ offer: PlusOffer) async throws(PurchaseError) -> PurchaseOutcome {
        let package = try await currentPackage(identifier: offer.packageId)
        do {
            let result = try await Purchases.shared.purchase(package: package)
            return result.userCancelled ? .cancelled : .purchased
        } catch let error as ErrorCode where error == .purchaseCancelledError {
            return .cancelled
        } catch let error as ErrorCode where error == .purchaseNotAllowedError {
            throw .notAllowed
        } catch {
            throw .failed
        }
    }

    func restore() async throws(PurchaseError) {
        do {
            _ = try await Purchases.shared.restorePurchases()
        } catch {
            throw .failed
        }
    }

    /// Package de l'offre courante : `identifier`, sinon le mensuel, sinon le premier.
    private func currentPackage(identifier: String? = nil) async throws(PurchaseError) -> Package {
        let offerings: Offerings
        do {
            offerings = try await Purchases.shared.offerings()
        } catch {
            throw .failed
        }
        guard let offering = offerings.current else { throw .offerUnavailable }
        let package = identifier.flatMap { offering.package(identifier: $0) }
            ?? offering.monthly
            ?? offering.availablePackages.first
        guard let package else { throw .offerUnavailable }
        return package
    }

    private static func periodLabel(_ period: SubscriptionPeriod?) -> String {
        guard let period else { return "mois" }
        let unit = switch period.unit {
        case .day: "jour"
        case .week: "semaine"
        case .month: "mois"
        case .year: "an"
        }
        return period.value == 1 ? unit : "\(period.value) \(unit)"
    }
}

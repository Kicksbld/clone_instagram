import Foundation

/// Offre Clone Plus présentée par le paywall : prix localisé fourni par StoreKit (ADR-012).
struct PlusOffer: Equatable {
    /// Identifiant du package RevenueCat (`$rc_monthly`).
    let packageId: String
    /// Prix localisé (ex. « 4,99 € »).
    let price: String
    /// Période facturée (ex. « mois »).
    let period: String
}

enum PurchaseOutcome: Equatable {
    case purchased
    /// L'utilisateur a fermé la feuille d'achat d'Apple.
    case cancelled
}

enum PurchaseError: Error, Equatable {
    /// Aucune offre courante (RevenueCat non configuré ou produit absent).
    case offerUnavailable
    /// Achats intégrés désactivés sur l'appareil (contrôle parental…).
    case notAllowed
    /// Échec du store ou de RevenueCat (réseau…).
    case failed
}

/// Achat dans l'app par RevenueCat (`purchases-ios`, ADR-012). Le statut du SDK ne sert qu'à
/// l'affichage : l'avantage n'est débloqué que par le plan renvoyé par l'API.
protocol PurchaseService: Sendable {
    /// Client RevenueCat = identifiant de profil, sans email (`Purchases.logIn`).
    func logIn(profileId: String) async
    /// Déconnexion RevenueCat, à la déconnexion de l'app.
    func logOut() async
    /// Offre courante (`default`, package mensuel).
    func plusOffer() async throws(PurchaseError) -> PlusOffer
    func purchase(_ offer: PlusOffer) async throws(PurchaseError) -> PurchaseOutcome
    /// Restaurer les achats (exigence App Store).
    func restore() async throws(PurchaseError)
}

/// Utilisé quand la clé RevenueCat est absente : le paywall affiche une erreur au lieu de planter.
struct UnavailablePurchaseService: PurchaseService {
    func logIn(profileId _: String) async {}

    func logOut() async {}

    func plusOffer() async throws(PurchaseError) -> PlusOffer {
        throw .offerUnavailable
    }

    func purchase(_: PlusOffer) async throws(PurchaseError) -> PurchaseOutcome {
        throw .offerUnavailable
    }

    func restore() async throws(PurchaseError) {
        throw .failed
    }
}

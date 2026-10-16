import Foundation
import Observation

/// Paramètres > Confidentialité du compte (`PATCH /v1/me/settings`) : compte privé ou public, changé
/// tout de suite, sans bloquer l'interrupteur (optimiste sur `OptimisticSync`, retour arrière et message en
/// cas d'échec, ADR-020). Seul cet écran affiche ce paramètre : pas de store partagé.
@Observable
final class AccountPrivacyViewModel {
    /// Valeur affichée : voulue pendant l'appel, puis confirmée par l'API.
    private(set) var isPrivate: Bool
    /// Échec de l'enregistrement, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?

    /// Dernière valeur confirmée par l'API.
    private var confirmedIsPrivate: Bool
    private let sync = OptimisticSync<String, Bool>()
    private let identity: any IdentityService
    /// Profil renvoyé par l'API : mon profil est mis à jour partout.
    private let onUpdated: (Profile) -> Void

    init(isPrivate: Bool, identity: any IdentityService, onUpdated: @escaping (Profile) -> Void = { _ in }) {
        self.isPrivate = isPrivate
        confirmedIsPrivate = isPrivate
        self.identity = identity
        self.onUpdated = onUpdated
    }

    func setPrivate(_ isPrivate: Bool) async {
        guard isPrivate != self.isPrivate else { return }
        self.isPrivate = isPrivate

        var updated: Profile?
        let outcome = await sync.sync(
            "isPrivate",
            to: isPrivate,
            confirmed: confirmedIsPrivate,
            intentOf: { $0 }
        ) { wanted throws(IdentityServiceError) -> Bool in
            let profile = try await identity.updateSettings(isPrivate: wanted)
            updated = profile
            return profile.isPrivate
        }
        if let updated {
            confirmedIsPrivate = updated.isPrivate
            onUpdated(updated)
        }
        switch outcome {
        case .pending:
            break
        case let .confirmed(value):
            self.isPrivate = value
        case let .failed(error, _, confirmed):
            self.isPrivate = confirmed
            errorMessage = error == .unreachable
                ? "Connexion impossible. Vérifiez votre réseau, puis réessayez."
                : "Le paramètre n'a pas pu être modifié. Réessayez."
        }
    }
}

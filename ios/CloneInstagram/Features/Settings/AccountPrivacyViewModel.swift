import Foundation
import Observation

/// Paramètres > Confidentialité du compte (`PATCH /v1/me/settings`) : compte privé ou public, changé
/// tout de suite (optimiste, retour arrière en cas d'échec, ADR-010).
@Observable
final class AccountPrivacyViewModel {
    private(set) var isPrivate: Bool
    private(set) var isSaving = false
    /// Échec de l'enregistrement, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?

    private let identity: any IdentityService
    /// Profil renvoyé par l'API : mon profil (cadenas, compteurs) est mis à jour partout.
    private let onUpdated: (Profile) -> Void

    init(isPrivate: Bool, identity: any IdentityService, onUpdated: @escaping (Profile) -> Void = { _ in }) {
        self.isPrivate = isPrivate
        self.identity = identity
        self.onUpdated = onUpdated
    }

    func setPrivate(_ isPrivate: Bool) async {
        guard isPrivate != self.isPrivate, !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        self.isPrivate = isPrivate
        do {
            let profile = try await identity.updateSettings(isPrivate: isPrivate)
            self.isPrivate = profile.isPrivate
            onUpdated(profile)
        } catch {
            self.isPrivate = !isPrivate
            errorMessage = error == .unreachable
                ? "Connexion impossible. Vérifiez votre réseau, puis réessayez."
                : "Le paramètre n'a pas pu être modifié. Réessayez."
        }
    }
}

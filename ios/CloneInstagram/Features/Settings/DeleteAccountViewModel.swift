import Foundation
import Observation

/// Paramètres > Supprimer le compte (`DELETE /v1/me`) : une fois le compte supprimé, l'app se déconnecte
/// (analytics, RevenueCat, session) et revient à l'écran de bienvenue.
@Observable
final class DeleteAccountViewModel {
    private(set) var isDeleting = false
    /// Échec de la suppression, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?

    private let identity: any IdentityService
    /// Déconnexion complète, appelée seulement si la suppression a réussi.
    private let onDeleted: () -> Void

    init(identity: any IdentityService, onDeleted: @escaping () -> Void) {
        self.identity = identity
        self.onDeleted = onDeleted
    }

    func deleteAccount() async {
        guard !isDeleting else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await identity.deleteMe()
            onDeleted()
        } catch {
            errorMessage = error == .unreachable
                ? "Connexion impossible. Vérifiez votre réseau, puis réessayez."
                : "Votre compte n'a pas pu être supprimé. Réessayez."
        }
    }
}

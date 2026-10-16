import SwiftUI

/// Écran bloquant d'un compte suspendu ou banni (ADR-005, wireframe) : l'API refuse toute autre route, seuls
/// la déconnexion et la suppression du compte restent possibles. La suppression est fournie par `App`
/// (feature `Settings`) : une feature n'importe pas une autre.
struct SuspendedAccountView<DeleteAccount: View>: View {
    let profile: Profile
    let onSignOut: () -> Void
    @ViewBuilder let deleteAccount: () -> DeleteAccount

    private var explanation: String {
        switch profile.status {
        case .banned:
            "Votre compte @\(profile.username) a été désactivé définitivement, car il ne respecte pas "
                + "nos Règles de la communauté."
        case .active, .suspended:
            "Votre compte @\(profile.username) a été suspendu, car il ne respecte pas nos Règles de la "
                + "communauté. Vous ne pouvez pas utiliser Clone Instagram pour le moment."
        }
    }

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Compte suspendu", systemImage: "exclamationmark.lock")
            } description: {
                Text(explanation)
            } actions: {
                NavigationLink("Supprimer le compte") {
                    deleteAccount()
                }
                Button("Se déconnecter", action: onSignOut)
            }
        }
    }
}

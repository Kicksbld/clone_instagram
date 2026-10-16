import StoreKit
import SwiftUI

/// Paramètres > Supprimer le compte (wireframe) : explication, rappel de résilier l'abonnement Apple, puis
/// confirmation.
struct DeleteAccountView: View {
    let planStatus: PlanStatus
    let viewModel: DeleteAccountViewModel

    private static let explanation = "Votre profil, vos photos, vos publications, vos commentaires et vos J'aime "
        + "seront définitivement supprimés. Cette action est irréversible."
    private static let subscriptionReminder = "La suppression du compte ne résilie pas votre abonnement Clone Plus. "
        + "Résiliez-le depuis votre compte Apple pour ne plus être facturé."

    @State private var isConfirming = false
    @State private var isManagingSubscription = false

    var body: some View {
        List {
            Section {
                Text(Self.explanation)
            }
            if planStatus.plan == .plus {
                Section {
                    Text(Self.subscriptionReminder)
                    Button("Gérer l'abonnement") { isManagingSubscription = true }
                }
            }
            Section {
                Button(role: .destructive) {
                    isConfirming = true
                } label: {
                    if viewModel.isDeleting {
                        ProgressView()
                    } else {
                        Text("Supprimer le compte")
                    }
                }
                .disabled(viewModel.isDeleting)
            }
        }
        .navigationTitle("Supprimer le compte")
        .navigationBarTitleDisplayMode(.inline)
        .manageSubscriptionsSheet(isPresented: $isManagingSubscription)
        .alert("Supprimer votre compte ?", isPresented: $isConfirming) {
            Button("Supprimer", role: .destructive) {
                Task { await viewModel.deleteAccount() }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Vos données et vos fichiers seront définitivement supprimés.")
        }
        .alert(
            "Supprimer le compte",
            isPresented: Binding(get: { viewModel.errorMessage != nil }, set: {
                if !$0 {
                    viewModel.errorMessage = nil
                }
            }),
            presenting: viewModel.errorMessage
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { message in
            Text(message)
        }
    }
}

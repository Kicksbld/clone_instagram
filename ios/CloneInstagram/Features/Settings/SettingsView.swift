import StoreKit
import SwiftUI

/// Paramètres et activité (wireframe, comme Instagram) : Clone Plus, confidentialité du compte, comptes
/// bloqués, déconnexion et suppression du compte. Le paywall est fourni par le routeur racine : une feature n'importe pas une autre
/// (ADR-010).
struct SettingsView<Paywall: View>: View {
    let planStatus: PlanStatus
    let icons: AppIconViewModel
    let privacy: AccountPrivacyViewModel
    let blockedAccounts: BlockedAccountsViewModel
    let deleteAccount: DeleteAccountViewModel
    /// Plan relu par l'API à l'ouverture de Clone Plus.
    let onRefreshPlan: () async -> Void
    let onSignOut: () -> Void
    @ViewBuilder let paywall: () -> Paywall

    @State private var isConfirmingSignOut = false

    var body: some View {
        List {
            Section("Votre compte") {
                NavigationLink {
                    ClonePlusView(planStatus: planStatus, icons: icons, onRefreshPlan: onRefreshPlan, paywall: paywall)
                } label: {
                    LabeledContent {
                        Text(planStatus.plan == .plus ? "Abonné" : "")
                    } label: {
                        Label("Clone Plus", systemImage: "plus.circle")
                    }
                }
            }
            Section("Qui peut voir votre contenu") {
                NavigationLink {
                    AccountPrivacyView(viewModel: privacy)
                } label: {
                    LabeledContent {
                        Text(privacy.isPrivate ? "Privé" : "Public")
                    } label: {
                        Label("Confidentialité du compte", systemImage: "lock")
                    }
                }
            }
            Section("Comment les autres peuvent interagir avec vous") {
                NavigationLink {
                    BlockedAccountsView(viewModel: blockedAccounts)
                } label: {
                    Label("Comptes bloqués", systemImage: "hand.raised")
                }
            }
            Section("Connexion") {
                Button("Se déconnecter", role: .destructive) { isConfirmingSignOut = true }
                NavigationLink("Supprimer le compte") {
                    DeleteAccountView(planStatus: planStatus, viewModel: deleteAccount)
                }
            }
        }
        .navigationTitle("Paramètres et activité")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Se déconnecter ?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
            Button("Se déconnecter", role: .destructive, action: onSignOut)
            Button("Annuler", role: .cancel) {}
        }
    }
}

/// Paramètres > Clone Plus : paywall sans abonnement ; sinon statut, icône de l'app et gestion.
private struct ClonePlusView<Paywall: View>: View {
    let planStatus: PlanStatus
    let icons: AppIconViewModel
    let onRefreshPlan: () async -> Void
    @ViewBuilder let paywall: () -> Paywall

    @State private var isManagingSubscription = false

    var body: some View {
        content
            .navigationTitle("Clone Plus")
            .navigationBarTitleDisplayMode(.inline)
            .task { await onRefreshPlan() }
    }

    @ViewBuilder
    private var content: some View {
        if planStatus.plan == .plus {
            List {
                Section {
                    LabeledContent("Statut", value: "Abonné")
                    if let expiresAt = planStatus.expiresAt {
                        LabeledContent("Prochaine échéance", value: expiresAt.formatted(date: .long, time: .omitted))
                    }
                }
                Section("Icône de l'app") {
                    ForEach(AppIcon.allCases) { icon in
                        Button {
                            Task { await icons.select(icon, isPlus: true) }
                        } label: {
                            LabeledContent(icon.title) {
                                if icons.selected == icon {
                                    Image(systemName: "checkmark").accessibilityLabel("Sélectionnée")
                                }
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
                Section {
                    Button("Gérer l'abonnement") { isManagingSubscription = true }
                }
            }
            .manageSubscriptionsSheet(isPresented: $isManagingSubscription)
            .alert(
                "Icône de l'app",
                isPresented: Binding(get: { icons.message != nil }, set: {
                    if !$0 {
                        icons.message = nil
                    }
                }),
                presenting: icons.message
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { message in
                Text(message)
            }
        } else {
            paywall()
        }
    }
}

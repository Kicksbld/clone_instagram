import SwiftUI

/// Paramètres > Confidentialité du compte (wireframe, comme Instagram) : interrupteur « Compte privé »,
/// avec confirmation dans les deux sens, et « Activité dans l'onglet Amis » (ADR-029).
struct AccountPrivacyView: View {
    @State private var viewModel: AccountPrivacyViewModel
    /// Valeur demandée par l'interrupteur, en attente de confirmation.
    @State private var requested: Bool?

    init(viewModel: AccountPrivacyViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        List {
            Section {
                Toggle(
                    "Compte privé",
                    isOn: Binding(get: { viewModel.isPrivate }, set: { requested = $0 })
                )
            } footer: {
                Text(
                    """
                    Lorsque votre compte est public, votre profil et vos publications peuvent être vus par \
                    tout le monde, sur Clone ou en dehors.

                    Lorsque votre compte est privé, seuls vos abonnés peuvent voir ce que vous partagez. Vos \
                    abonnés actuels ne sont pas concernés.
                    """
                )
            }
            Section {
                Picker(
                    "Activité dans l’onglet Amis",
                    selection: Binding(
                        get: { viewModel.friendsTabActivity },
                        set: { activity in Task { await viewModel.setFriendsTabActivity(activity) } }
                    )
                ) {
                    Text("Abonnés mutuels").tag(FriendsTabActivity.mutuals)
                    Text("Personne").tag(FriendsTabActivity.nobody)
                }
                .pickerStyle(.navigationLink)
            } footer: {
                Text(
                    "Choisissez qui peut voir les reels que vous aimez ou commentez dans l’onglet Amis des Reels. "
                        + "Les reels que vous publiez y restent visibles de vos abonnés mutuels."
                )
            }
        }
        .navigationTitle("Confidentialité du compte")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            requested == true ? "Passer en compte privé ?" : "Passer en compte public ?",
            isPresented: Binding(
                get: { requested != nil },
                set: {
                    if !$0 {
                        requested = nil
                    }
                }
            ),
            titleVisibility: .visible,
            presenting: requested
        ) { isPrivate in
            Button(isPrivate ? "Passer en privé" : "Passer en public") {
                Task { await viewModel.setPrivate(isPrivate) }
            }
            Button("Annuler", role: .cancel) {}
        } message: { isPrivate in
            Text(
                isPrivate
                    ? "Seuls vos abonnés pourront voir vos photos et vidéos. Les personnes qui vous suivent déjà ne seront pas concernées."
                    : "Tout le monde pourra voir vos publications, sur Clone ou en dehors."
            )
        }
        .alert(
            "Action impossible",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: {
                    if !$0 {
                        viewModel.errorMessage = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }
}

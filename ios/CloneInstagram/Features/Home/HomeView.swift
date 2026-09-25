import SwiftUI

/// Accueil (wireframe) : onglets d'Instagram, contenus à venir dans les prochaines tranches.
/// Les écrans Profil et Recherche sont fournis par le routeur racine : une feature n'en importe pas une autre.
/// `profileTab` reçoit l'action qui ouvre l'onglet Recherche (« Suivre des comptes »).
struct HomeView<ProfileTab: View, SearchTab: View>: View {
    enum TabID: Hashable {
        case home
        case reels
        case messages
        case search
        case profile
    }

    @ViewBuilder let profileTab: (_ openSearch: @escaping () -> Void) -> ProfileTab
    @ViewBuilder let searchTab: () -> SearchTab

    @State private var selection = TabID.home

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house", value: TabID.home) {
                NavigationStack {
                    placeholder("Accueil", systemImage: "house")
                        .toolbar {
                            // Création d'un post : T6a.
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Créer", systemImage: "plus") {}
                                    .disabled(true)
                            }
                        }
                }
            }
            Tab("Reels", systemImage: "play.rectangle", value: TabID.reels) {
                placeholder("Reels", systemImage: "play.rectangle")
            }
            Tab("Messages", systemImage: "paperplane", value: TabID.messages) {
                placeholder("Messages", systemImage: "paperplane")
            }
            Tab("Recherche", systemImage: "magnifyingglass", value: TabID.search) {
                NavigationStack(root: searchTab)
            }
            Tab("Profil", systemImage: "person.crop.circle", value: TabID.profile) {
                NavigationStack {
                    profileTab { selection = .search }
                }
            }
        }
    }

    private func placeholder(_ title: String, systemImage: String) -> some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text("Bientôt disponible."))
    }
}

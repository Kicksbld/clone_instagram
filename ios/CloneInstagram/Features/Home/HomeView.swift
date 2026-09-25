import SwiftUI

/// Accueil (wireframe) : onglets d'Instagram, contenus à venir dans les prochaines tranches.
/// Les écrans Profil et Recherche sont fournis par le routeur racine : une feature n'en importe pas une autre.
struct HomeView<ProfileTab: View, SearchTab: View>: View {
    @ViewBuilder let profileTab: () -> ProfileTab
    @ViewBuilder let searchTab: () -> SearchTab

    var body: some View {
        TabView {
            Tab("Accueil", systemImage: "house") {
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
            Tab("Reels", systemImage: "play.rectangle") {
                placeholder("Reels", systemImage: "play.rectangle")
            }
            Tab("Messages", systemImage: "paperplane") {
                placeholder("Messages", systemImage: "paperplane")
            }
            Tab("Recherche", systemImage: "magnifyingglass") {
                NavigationStack(root: searchTab)
            }
            Tab("Profil", systemImage: "person.crop.circle") {
                NavigationStack(root: profileTab)
            }
        }
    }

    private func placeholder(_ title: String, systemImage: String) -> some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text("Bientôt disponible."))
    }
}

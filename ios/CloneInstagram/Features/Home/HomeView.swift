import SwiftUI

/// Accueil (wireframe) : onglets d'Instagram, contenus à venir dans les prochaines tranches.
/// Les écrans Profil, Recherche et Création sont fournis par le routeur racine : une feature n'en importe
/// pas une autre. `profileTab` reçoit l'action qui ouvre l'onglet Recherche (« Suivre des comptes ») ;
/// `createPost` reçoit l'action qui ferme la création et revient à l'accueil.
struct HomeView<ProfileTab: View, SearchTab: View, CreatePost: View>: View {
    enum TabID: Hashable {
        case home
        case reels
        case messages
        case search
        case profile
    }

    /// Publications en cours, affichées en haut de l'accueil.
    let publishQueue: PublishQueue
    @ViewBuilder let profileTab: (_ openSearch: @escaping () -> Void) -> ProfileTab
    @ViewBuilder let searchTab: () -> SearchTab
    @ViewBuilder let createPost: (_ close: @escaping () -> Void) -> CreatePost

    @State private var selection = TabID.home
    @State private var isCreating = false

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house", value: TabID.home) {
                NavigationStack {
                    VStack(spacing: 0) {
                        PublishBanner(queue: publishQueue)
                        // Feed d'accueil : T7.
                        placeholder("Accueil", systemImage: "house")
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Créer", systemImage: "plus") { isCreating = true }
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
        .fullScreenCover(isPresented: $isCreating) {
            createPost {
                isCreating = false
                selection = .home
            }
        }
    }

    private func placeholder(_ title: String, systemImage: String) -> some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text("Bientôt disponible."))
    }
}

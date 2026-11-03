import SwiftUI

/// Accueil (wireframe) : onglets d'Instagram, contenus à venir dans les prochaines tranches.
/// Les écrans Feed, Profil, Recherche et Création sont fournis par le routeur racine : une feature n'en
/// importe pas une autre. `feed` et `profileTab` reçoivent l'action qui ouvre l'onglet Recherche ;
/// `createPost` reçoit l'action qui ferme la création et revient à l'accueil. L'Activité s'ouvre par le
/// cœur de la barre du haut, comme Instagram (pas d'onglet dédié, ADR-026).
struct HomeView<Feed: View, ProfileTab: View, SearchTab: View, CreatePost: View, Activity: View, Messages: View>: View {
    enum TabID: Hashable {
        case home
        case reels
        case messages
        case search
        case profile
    }

    /// Publications en cours, affichées en haut de l'accueil.
    let publishQueue: PublishQueue
    /// Groupes non lus de l'Activité : pastille du cœur.
    let unreadActivityCount: Int
    @ViewBuilder let feed: (_ openSearch: @escaping () -> Void) -> Feed
    @ViewBuilder let profileTab: (_ openSearch: @escaping () -> Void) -> ProfileTab
    @ViewBuilder let searchTab: () -> SearchTab
    @ViewBuilder let createPost: (_ close: @escaping () -> Void) -> CreatePost
    @ViewBuilder let activity: () -> Activity

    @ViewBuilder let messages: () -> Messages

    @State private var selection = TabID.home
    @State private var isCreating = false

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house", value: TabID.home) {
                NavigationStack {
                    VStack(spacing: 0) {
                        PublishBanner(queue: publishQueue)
                        feed { selection = .search }
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Créer", systemImage: "plus") { isCreating = true }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            NavigationLink(destination: activity) {
                                Image(systemName: "heart")
                                    .overlay(alignment: .topTrailing) {
                                        if unreadActivityCount > 0 {
                                            // Pastille des notifications non lues (wireframe : sans couleur).
                                            Circle()
                                                .frame(width: 8, height: 8)
                                                .offset(x: 3, y: -2)
                                        }
                                    }
                            }
                            .accessibilityLabel("Notifications")
                            .accessibilityValue(unreadActivityCount > 0 ? "\(unreadActivityCount) non lues" : "")
                        }
                    }
                }
            }
            Tab("Reels", systemImage: "play.rectangle", value: TabID.reels) {
                placeholder("Reels", systemImage: "play.rectangle")
            }
            Tab("Messages", systemImage: "paperplane", value: TabID.messages) {
                NavigationStack(root: messages)
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

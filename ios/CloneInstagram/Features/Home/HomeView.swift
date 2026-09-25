import SwiftUI

/// Accueil (wireframe) : onglets d'Instagram, contenus à venir dans les prochaines tranches.
struct HomeView: View {
    let profile: Profile
    let onSignOut: () -> Void

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
                placeholder("Recherche", systemImage: "magnifyingglass")
            }
            Tab("Profil", systemImage: "person.crop.circle") {
                NavigationStack {
                    VStack(spacing: 8) {
                        Image(systemName: "person.crop.circle")
                            .font(.system(size: 80))
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                        Text(profile.fullName)
                            .font(.headline)
                        if !profile.bio.isEmpty {
                            Text(profile.bio)
                        }
                        Spacer()
                        // Provisoire jusqu'aux paramètres (T12).
                        Button("Se déconnecter", action: onSignOut)
                    }
                    .padding()
                    .navigationTitle(profile.username)
                    .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    private func placeholder(_ title: String, systemImage: String) -> some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text("Bientôt disponible."))
    }
}

import SwiftUI

/// Accueil (wireframe) : onglets d'Instagram, contenus à venir dans les prochaines tranches.
/// L'écran « Modifier le profil » est fourni par le routeur racine : une feature n'en importe pas une autre.
struct HomeView<EditProfile: View>: View {
    let profile: Profile
    let onSignOut: () -> Void
    @ViewBuilder let editProfile: () -> EditProfile

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
                        AvatarView(avatar: profile.avatar, size: 86)
                        Text(profile.fullName)
                            .font(.headline)
                        if !profile.bio.isEmpty {
                            Text(profile.bio)
                        }
                        NavigationLink("Modifier le profil", destination: editProfile)
                            .buttonStyle(.bordered)
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

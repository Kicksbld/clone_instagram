import SwiftUI

/// Profil d'un autre utilisateur (wireframe) : en-tête, « Vous suit », grille vide ou compte privé.
struct UserProfileView: View {
    @State private var viewModel: UserProfileViewModel

    init(viewModel: UserProfileViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle(viewModel.username)
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
        case let .loaded(profile):
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ProfileHeaderView(
                        avatar: profile.avatar,
                        fullName: profile.fullName,
                        bio: profile.bio,
                        postCount: profile.postCount,
                        followerCount: profile.followerCount,
                        followingCount: profile.followingCount
                    )
                    if profile.followsMe {
                        // Le bouton Suivre arrive en T5.
                        Text("Vous suit")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if profile.canViewContent {
                        ProfileEmptyGridView()
                    } else {
                        ContentUnavailableView(
                            "Ce compte est privé",
                            systemImage: "lock",
                            description: Text("Seuls ses abonnés voient ses photos et vidéos.")
                        )
                    }
                }
                .padding()
            }
            .refreshable { await viewModel.load() }
        case .notFound:
            ContentUnavailableView(
                "Cette page n'est pas disponible",
                systemImage: "person.crop.circle.badge.questionmark",
                description: Text("Le lien est peut-être rompu, ou le profil a été supprimé.")
            )
        case let .failed(message):
            ContentUnavailableView {
                Label("Profil indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }
}

import SwiftUI

/// Feuille des amis qui ont interagi avec un reel (ADR-029) : « a aimé », « a commenté : texte »,
/// « a créé » ; chaque ligne ouvre le profil.
struct FriendInteractionsView: View {
    @State private var viewModel: FriendInteractionsViewModel
    let profileDestination: (ProfileRoute) -> AnyView
    @Environment(\.blockedUserIds) private var blockedIds

    init(viewModel: FriendInteractionsViewModel, profileDestination: @escaping (ProfileRoute) -> AnyView) {
        _viewModel = State(initialValue: viewModel)
        self.profileDestination = profileDestination
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Amis")
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: ProfileRoute.self, destination: profileDestination)
        }
        .task { await viewModel.load() }
    }

    @ViewBuilder private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed:
            ContentUnavailableView {
                Label("Amis indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text("Impossible de charger les amis. Vérifiez votre connexion et réessayez.")
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        case .unavailable:
            ContentUnavailableView(
                "Reel indisponible",
                systemImage: "play.slash",
                description: Text("Ce reel n’existe plus ou n’est plus visible.")
            )
        case let .loaded(items):
            let visible = items.filter { !blockedIds.contains($0.user.id) }
            if visible.isEmpty {
                ContentUnavailableView(
                    "Aucun ami",
                    systemImage: "person.2",
                    description: Text("Aucun de vos amis n’a interagi avec ce reel.")
                )
            } else {
                List(visible) { item in
                    NavigationLink(value: ProfileRoute(username: item.user.username)) {
                        HStack(spacing: 12) {
                            AvatarView(avatar: item.user.avatar, size: 40)
                            VStack(alignment: .leading) {
                                Text(item.user.username).bold()
                                Text(item.detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }
}

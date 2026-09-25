import SwiftUI

/// Abonnés et abonnements d'un compte (wireframe), comme Instagram : deux onglets sous le username.
struct FollowListsView: View {
    let route: FollowListRoute
    @State private var selection: FollowListKind
    @State private var followers: FollowListViewModel
    @State private var following: FollowListViewModel

    init(route: FollowListRoute, followers: FollowListViewModel, following: FollowListViewModel) {
        self.route = route
        _selection = State(initialValue: route.kind)
        _followers = State(initialValue: followers)
        _following = State(initialValue: following)
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Liste", selection: $selection) {
                Text("\(route.followerCount.formatted()) followers").tag(FollowListKind.followers)
                Text("\(route.followingCount.formatted()) suivi(e)s").tag(FollowListKind.following)
            }
            .pickerStyle(.segmented)
            .padding()
            switch selection {
            case .followers:
                FollowListView(viewModel: followers)
            case .following:
                FollowListView(viewModel: following)
            }
        }
        .navigationTitle(route.username)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Une liste paginée ; toucher une ligne ouvre le profil (`ProfileRoute`).
struct FollowListView: View {
    @Bindable var viewModel: FollowListViewModel
    @State private var pendingUnfollow: UserSummary?

    var body: some View {
        content
            .task { await viewModel.load() }
            .alert(
                "Action impossible",
                isPresented: Binding(
                    get: { viewModel.actionErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.actionErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.actionErrorMessage ?? "")
            }
            .confirmationDialog(
                "Ne plus suivre \(pendingUnfollow?.username ?? "") ?",
                isPresented: Binding(get: { pendingUnfollow != nil }, set: {
                    if !$0 {
                        pendingUnfollow = nil
                    }
                }),
                titleVisibility: .visible,
                presenting: pendingUnfollow
            ) { user in
                Button("Ne plus suivre", role: .destructive) {
                    Task { await viewModel.setFollowing(false, for: user) }
                }
            } message: { _ in
                Text("Ce compte est privé : vous ne pourrez plus voir ses publications.")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
                .frame(maxHeight: .infinity)
        case .loaded where viewModel.users.isEmpty:
            ContentUnavailableView(
                viewModel.kind == .followers ? "Aucun follower" : "Aucun compte suivi",
                systemImage: "person.2"
            )
        case .loaded:
            List {
                ForEach(viewModel.users) { user in
                    row(user)
                        .onAppear {
                            if user.id == viewModel.users.last?.id {
                                Task { await viewModel.loadMore() }
                            }
                        }
                }
                if viewModel.isLoadingMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        case .notFound:
            ContentUnavailableView(
                "Liste indisponible",
                systemImage: "lock",
                description: Text("Seuls les abonnés de ce compte voient ses listes.")
            )
        case let .failed(message):
            ContentUnavailableView {
                Label("Liste indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }

    private func row(_ user: UserSummary) -> some View {
        NavigationLink(value: ProfileRoute(username: user.username)) {
            UserRow(user: user) {
                if viewModel.canFollow(user) {
                    FollowButton(isFollowing: user.isFollowing, followsMe: user.followsMe) {
                        if !user.isFollowing {
                            Task { await viewModel.setFollowing(true, for: user) }
                        } else if user.isPrivate {
                            pendingUnfollow = user
                        } else {
                            Task { await viewModel.setFollowing(false, for: user) }
                        }
                    }
                    // Style `bordered` : le bouton garde son geste dans la ligne qui ouvre le profil.
                    .controlSize(.small)
                }
            }
        }
    }
}

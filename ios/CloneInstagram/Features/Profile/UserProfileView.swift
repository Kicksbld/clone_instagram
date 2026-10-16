import SwiftUI

/// Profil d'un autre utilisateur (wireframe) : en-tête, bouton Suivre, grille des publications ou compte privé.
struct UserProfileView: View {
    @State private var viewModel: UserProfileViewModel
    @State private var isConfirmingUnfollow = false
    @Environment(\.moderation) private var moderation
    @Environment(\.blockedUserIds) private var blockedUserIds
    @Environment(\.dismiss) private var dismiss
    private let posts: any PostService

    init(viewModel: UserProfileViewModel, posts: any PostService) {
        _viewModel = State(initialValue: viewModel)
        self.posts = posts
    }

    var body: some View {
        content
            .navigationTitle(viewModel.username)
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            .toolbar {
                if case let .loaded(profile) = viewModel.state, let moderation {
                    ToolbarItem(placement: .topBarTrailing) {
                        moderationMenu(profile, actions: moderation)
                    }
                }
            }
            // Compte bloqué depuis ce profil : il devient invisible, retour à l'écran précédent (ADR-006).
            .onChange(of: blockedUserIds) {
                if case let .loaded(profile) = viewModel.state, blockedUserIds.contains(profile.id) {
                    dismiss()
                }
            }
            .alert(
                "Action impossible",
                isPresented: Binding(
                    get: { viewModel.followErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.followErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.followErrorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
        case let .loaded(profile):
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 16) {
                        ProfileHeaderView(
                            avatar: profile.avatar,
                            fullName: profile.fullName,
                            bio: profile.bio,
                            postCount: profile.postCount,
                            followerCount: profile.followerCount,
                            followingCount: profile.followingCount,
                            listRoute: profile.canViewContent ? { kind in
                                FollowListRoute(
                                    userId: profile.id,
                                    username: profile.username,
                                    followerCount: profile.followerCount,
                                    followingCount: profile.followingCount,
                                    kind: kind
                                )
                            } : nil
                        )
                        if viewModel.canFollow(profile) {
                            followButton(profile)
                        }
                    }
                    .padding([.horizontal, .top])
                    if profile.canViewContent {
                        ProfilePostsGrid(viewModel: ProfilePostsViewModel(userId: profile.id, posts: posts))
                            // Nouvelle grille seulement si la visibilité des contenus change (pas à chaque tap Suivre).
                            .id(profile.canViewContent)
                    } else {
                        ContentUnavailableView(
                            "Ce compte est privé",
                            systemImage: "lock",
                            description: Text("Seuls ses abonnés voient ses photos et vidéos.")
                        )
                    }
                }
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

    /// Menu « … » de la barre du haut, comme Instagram : « Bloquer » et « Signaler ».
    private func moderationMenu(_ profile: UserProfile, actions: ModerationActions) -> some View {
        let account = BlockRoute(userId: profile.id, username: profile.username)
        return Menu("Plus d'options", systemImage: "ellipsis") {
            Button("Bloquer", systemImage: "hand.raised", role: .destructive) {
                actions.block(account)
            }
            Button("Signaler", systemImage: "exclamationmark.bubble", role: .destructive) {
                actions.report(ReportRoute(target: .user(id: profile.id), author: account))
            }
        }
    }

    private func followButton(_ profile: UserProfile) -> some View {
        FollowButton(isFollowing: profile.isFollowing, followsMe: profile.followsMe, isFullWidth: true) {
            if profile.isFollowing {
                isConfirmingUnfollow = true
            } else {
                Task { await viewModel.follow() }
            }
        }
        .confirmationDialog(profile.username, isPresented: $isConfirmingUnfollow, titleVisibility: .visible) {
            Button("Ne plus suivre", role: .destructive) {
                Task { await viewModel.unfollow() }
            }
        } message: {
            if profile.isPrivate {
                Text("Ce compte est privé : vous ne pourrez plus voir ses publications, ni le suivre à nouveau pour l'instant.")
            }
        }
    }
}

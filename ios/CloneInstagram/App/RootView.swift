import SwiftUI

/// Routeur racine (ADR-010) : chargement → bienvenue / connexion / onboarding / accueil.
struct RootView: View {
    let dependencies: AppDependencies
    @State private var viewModel: RootViewModel

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
        _viewModel = State(initialValue: RootViewModel(auth: dependencies.auth, identity: dependencies.identity))
    }

    var body: some View {
        content
            .task { await viewModel.start() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.route {
        case .loading:
            AppLogo()
        case .welcome:
            WelcomeView(onSignUp: viewModel.showSignUp, onLogin: viewModel.showLogin)
        case .login:
            LoginView(
                viewModel: LoginViewModel(auth: dependencies.auth) { await viewModel.start() },
                onBack: viewModel.showWelcome,
                onSignUp: viewModel.showSignUp
            )
        case let .onboarding(entry):
            OnboardingFlowView(
                viewModel: OnboardingViewModel(
                    entry: entry,
                    auth: dependencies.auth,
                    identity: dependencies.identity,
                    uploads: dependencies.uploads,
                    onFinished: viewModel.finishOnboarding(with:)
                ),
                exitTitle: entry == .newAccount ? "Annuler" : "Se déconnecter",
                onExit: {
                    if entry == .newAccount {
                        viewModel.showWelcome()
                    } else {
                        Task { await viewModel.signOut() }
                    }
                },
                onLogin: viewModel.showLogin
            )
            .id(entry)
        case let .home(profile):
            HomeView(publishQueue: dependencies.publishQueue) { openSearch in
                MyProfileView(
                    profile: profile,
                    onRefresh: viewModel.refreshProfile,
                    onSignOut: signOut,
                    onFollowAccounts: openSearch,
                    posts: ProfilePostsViewModel(userId: profile.id, posts: dependencies.posts),
                    postsReloadToken: dependencies.publishQueue.publishedCount,
                    editProfile: {
                        EditProfileView(
                            viewModel: EditProfileViewModel(
                                profile: profile,
                                identity: dependencies.identity,
                                uploads: dependencies.uploads,
                                onUpdated: viewModel.updateProfile
                            )
                        )
                    }
                )
                .modifier(SocialDestinations(dependencies: dependencies, viewerId: profile.id, onFollowChange: viewModel.refreshProfile))
            } searchTab: {
                SearchView(viewModel: SearchViewModel(social: dependencies.social))
                    .modifier(SocialDestinations(
                        dependencies: dependencies,
                        viewerId: profile.id,
                        onFollowChange: viewModel.refreshProfile
                    ))
            } createPost: { close in
                CreatePostView(
                    viewModel: CreatePostViewModel(authorId: profile.id, publisher: dependencies.publishQueue),
                    onClose: close
                )
            }
            // Reprise des publications interrompues (fermeture de l'app) ; compteurs rechargés après chaque post.
            .task(id: profile.id) { dependencies.publishQueue.resume(for: profile.id) }
            .onChange(of: dependencies.publishQueue.publishedCount) {
                Task { await viewModel.refreshProfile() }
            }
        case let .failed(message):
            ContentUnavailableView {
                Label("Connexion impossible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.start() } }
                Button("Se déconnecter", action: signOut)
            }
        }
    }

    /// Les publications en attente ne sont jamais reprises pour un autre compte.
    private func signOut() {
        dependencies.publishQueue.discardAll()
        Task { await viewModel.signOut() }
    }
}

/// Destinations partagées des onglets Profil et Recherche : profil d'un autre compte, listes
/// d'abonnés et détail d'un post. Déclarées ici : une feature n'importe pas une autre (ADR-010).
private struct SocialDestinations: ViewModifier {
    let dependencies: AppDependencies
    let viewerId: String
    /// Après un follow ou un unfollow : mon profil (compteur « suivi(e)s ») est rechargé.
    let onFollowChange: () async -> Void

    func body(content: Content) -> some View {
        content
            .navigationDestination(for: ProfileRoute.self) { route in
                UserProfileView(
                    viewModel: UserProfileViewModel(
                        username: route.username,
                        viewerId: viewerId,
                        identity: dependencies.identity,
                        social: dependencies.social,
                        onFollowChange: onFollowChange
                    ),
                    posts: dependencies.posts
                )
            }
            .navigationDestination(for: PostRoute.self) { route in
                PostDetailView(viewModel: PostDetailViewModel(postId: route.postId, posts: dependencies.posts))
            }
            .navigationDestination(for: FollowListRoute.self) { route in
                FollowListsView(
                    route: route,
                    followers: listViewModel(.followers, route),
                    following: listViewModel(.following, route)
                )
            }
    }

    private func listViewModel(_ kind: FollowListKind, _ route: FollowListRoute) -> FollowListViewModel {
        FollowListViewModel(
            kind: kind,
            userId: route.userId,
            viewerId: viewerId,
            social: dependencies.social,
            onFollowChange: onFollowChange
        )
    }
}

import SwiftUI

/// Routeur racine (ADR-010) : chargement → bienvenue / connexion / onboarding / accueil.
struct RootView: View {
    let dependencies: AppDependencies
    @State private var viewModel: RootViewModel
    /// Incrémenté à chaque post supprimé : grille et compteurs de mon profil se rechargent.
    @State private var deletedPostCount = 0
    /// Feuille des commentaires ouverte depuis un post (feed, détail).
    @State private var commentsRoute: CommentsRoute?
    /// Splash animé joué une seule fois, au lancement.
    @State private var isSplashFinished = false
    @Environment(\.scenePhase) private var scenePhase

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
        _viewModel = State(initialValue: RootViewModel(
            auth: dependencies.auth,
            identity: dependencies.identity,
            purchases: dependencies.purchases,
            subscriptions: dependencies.subscriptions,
            appIcons: dependencies.appIcons,
            analytics: dependencies.analytics
        ))
    }

    var body: some View {
        content
            .overlay {
                if !isSplashFinished {
                    SplashView(isReady: viewModel.route != .loading) { isSplashFinished = true }
                }
            }
            .task { await viewModel.start() }
            // Compte suspendu ou banni pendant la session (`403 account_suspended`, ADR-005).
            .onChange(of: dependencies.suspension.revision) {
                Task { await viewModel.accountSuspended() }
            }
            // Retour dans l'app : un compte réactivé quitte l'écran « Compte suspendu ».
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task { await viewModel.recheckSuspension() }
            }
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
                    analytics: dependencies.analytics,
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
        case let .paywall(profile):
            paywall(for: profile, onClose: viewModel.closePaywall)
        case let .home(profile):
            HomeView(publishQueue: dependencies.publishQueue) { openSearch in
                FeedView(
                    viewModel: FeedViewModel(
                        viewerId: profile.id,
                        posts: dependencies.posts,
                        likes: dependencies.likes,
                        commentCounts: dependencies.commentCounts,
                        prefetcher: dependencies.imagePrefetcher,
                        onDeleted: { deletedPostCount += 1 }
                    ),
                    revision: deletedPostCount + dependencies.blocks.revision,
                    publishedCount: dependencies.publishQueue.publishedCount,
                    onSearch: openSearch
                )
                .environment(\.openComments, openComments)
                .modifier(SocialDestinations(
                    dependencies: dependencies,
                    viewerId: profile.id,
                    onPostDeleted: { deletedPostCount += 1 },
                    openComments: openComments
                ))
            } profileTab: { openSearch in
                MyProfileView(
                    profile: dependencies.follows.displayed(me: profile),
                    onRefresh: refreshProfile,
                    onFollowAccounts: openSearch,
                    posts: ProfilePostsViewModel(userId: profile.id, posts: dependencies.posts),
                    postsReloadToken: postsRevision,
                    editProfile: {
                        EditProfileView(
                            viewModel: EditProfileViewModel(
                                profile: profile,
                                identity: dependencies.identity,
                                uploads: dependencies.uploads,
                                onUpdated: viewModel.updateProfile
                            )
                        )
                    },
                    settings: {
                        SettingsView(
                            planStatus: profile.planStatus,
                            icons: AppIconViewModel(service: dependencies.appIcons),
                            privacy: AccountPrivacyViewModel(
                                isPrivate: profile.isPrivate,
                                identity: dependencies.identity,
                                onUpdated: viewModel.updateProfile
                            ),
                            blockedAccounts: BlockedAccountsViewModel(
                                social: dependencies.social,
                                blocks: dependencies.blocks
                            ),
                            deleteAccount: DeleteAccountViewModel(
                                identity: dependencies.identity,
                                onDeleted: signOut
                            ),
                            onRefreshPlan: viewModel.refreshPlan,
                            onSignOut: signOut
                        ) {
                            paywall(for: profile, onClose: nil)
                        }
                    }
                )
                .modifier(SocialDestinations(
                    dependencies: dependencies,
                    viewerId: profile.id,
                    onPostDeleted: { deletedPostCount += 1 },
                    openComments: openComments
                ))
            } searchTab: {
                SearchView(viewModel: SearchViewModel(social: dependencies.social, follows: dependencies.follows))
                    .modifier(SocialDestinations(
                        dependencies: dependencies,
                        viewerId: profile.id,
                            onPostDeleted: { deletedPostCount += 1 },
                        openComments: openComments
                    ))
            } createPost: { close in
                CreatePostView(
                    viewModel: CreatePostViewModel(authorId: profile.id, publisher: dependencies.publishQueue),
                    onClose: close
                )
            }
            // Reprise des publications interrompues (fermeture de l'app) ; compteurs rechargés après chaque
            // post publié ou supprimé.
            .task(id: profile.id) { dependencies.publishQueue.resume(for: profile.id) }
            // Compteurs rechargés aussi après un blocage (abonnements supprimés dans les deux sens).
            .onChange(of: postsRevision + dependencies.blocks.revision) {
                Task { await refreshProfile() }
            }
            .modifier(ModerationPresenter(dependencies: dependencies))
            .sheet(item: $commentsRoute) { route in
                CommentsView(
                    viewModel: CommentsViewModel(
                        route: route,
                        viewer: PostAuthor(id: profile.id, username: profile.username, avatar: profile.avatar),
                        service: dependencies.comments,
                        counts: dependencies.commentCounts
                    )
                )
                .modifier(ModerationPresenter(dependencies: dependencies))
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        case let .suspended(profile):
            SuspendedAccountView(profile: profile, onSignOut: signOut) {
                DeleteAccountView(
                    planStatus: profile.planStatus,
                    viewModel: DeleteAccountViewModel(identity: dependencies.identity, onDeleted: signOut)
                )
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

    /// Paywall Clone Plus : fin de l'onboarding (`onClose` = « Plus tard ») ou Paramètres > Clone Plus.
    private func paywall(for profile: Profile, onClose: (() -> Void)?) -> some View {
        PaywallView(
            viewModel: PaywallViewModel(
                planStatus: profile.planStatus,
                purchases: dependencies.purchases,
                subscriptions: dependencies.subscriptions,
                analytics: dependencies.analytics,
                source: onClose == nil ? .settings : .onboarding,
                onPlanChanged: viewModel.updatePlan
            ),
            onClose: onClose
        )
    }

    /// Change à chaque post publié ou supprimé.
    private var postsRevision: Int {
        dependencies.publishQueue.publishedCount + deletedPostCount
    }

    /// Ouvre la feuille des commentaires d'un post.
    private var openComments: OpenCommentsAction {
        OpenCommentsAction { commentsRoute = $0 }
    }

    /// Mon profil rechargé : mon compteur « suivi(e)s » compte désormais les follows confirmés.
    private func refreshProfile() async {
        if await viewModel.refreshProfile() {
            dependencies.follows.myProfileReloaded()
        }
    }

    /// Les publications en attente, les likes, les abonnements, les compteurs de commentaires et les blocages
    /// de la session ne sont jamais repris pour un autre compte.
    private func signOut() {
        dependencies.publishQueue.discardAll()
        dependencies.likes.reset()
        dependencies.follows.reset()
        dependencies.commentCounts.reset()
        dependencies.blocks.reset()
        Task { await viewModel.signOut() }
    }
}

/// Destinations partagées des onglets Accueil, Profil et Recherche : profil d'un autre compte, listes
/// d'abonnés et détail d'un post. Déclarées ici : une feature n'importe pas une autre (ADR-010).
private struct SocialDestinations: ViewModifier {
    let dependencies: AppDependencies
    let viewerId: String
    /// Après la suppression d'un de mes posts.
    let onPostDeleted: () -> Void
    /// Feuille des commentaires, ouverte depuis le détail d'un post.
    let openComments: OpenCommentsAction

    func body(content: Content) -> some View {
        content
            .navigationDestination(for: ProfileRoute.self) { route in
                UserProfileView(
                    viewModel: UserProfileViewModel(
                        username: route.username,
                        viewerId: viewerId,
                        identity: dependencies.identity,
                        follows: dependencies.follows
                    ),
                    posts: dependencies.posts
                )
            }
            .navigationDestination(for: PostRoute.self) { route in
                PostDetailView(
                    viewModel: PostDetailViewModel(
                        postId: route.postId,
                        viewerId: viewerId,
                        posts: dependencies.posts,
                        likes: dependencies.likes,
                        commentCounts: dependencies.commentCounts,
                        onDeleted: onPostDeleted
                    )
                )
                .environment(\.openComments, openComments)
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
            follows: dependencies.follows
        )
    }
}

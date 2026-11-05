import SwiftUI

/// Destinations partagées des onglets Accueil, Profil et Recherche : profil d'un autre compte, listes
/// d'abonnés et détail d'un post. Déclarées ici : une feature n'importe pas une autre (ADR-010).
struct SocialDestinations: ViewModifier {
    let dependencies: AppDependencies
    let viewerId: String
    /// Feuille des commentaires, ouverte depuis le détail d'un post.
    let openComments: OpenCommentsAction

    func body(content: Content) -> some View {
        content
            .modifier(MentionNavigation())
            .navigationDestination(for: ConversationRoute.self) { route in
                OpenConversationView(route: route, store: dependencies.messaging, viewerId: viewerId)
            }
            .navigationDestination(for: ProfileRoute.self) { route in
                dependencies.userProfile(route, viewerId: viewerId)
            }
            .navigationDestination(for: PostRoute.self) { route in
                PostDetailView(
                    viewModel: PostDetailViewModel(
                        postId: route.postId,
                        viewerId: viewerId,
                        posts: dependencies.posts,
                        likes: dependencies.likes,
                        commentCounts: dependencies.commentCounts,
                        edits: dependencies.postEdits,
                        deletions: dependencies.postDeletions
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

extension AppDependencies {
    /// Profil d'un autre compte : destination des onglets et de la feuille des amis d'un reel (ADR-029).
    func userProfile(_ route: ProfileRoute, viewerId: String) -> some View {
        UserProfileView(
            viewModel: UserProfileViewModel(
                username: route.username,
                viewerId: viewerId,
                identity: identity,
                follows: follows
            ),
            posts: posts
        )
    }
}

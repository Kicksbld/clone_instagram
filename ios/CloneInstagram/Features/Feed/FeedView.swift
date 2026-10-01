import SwiftUI

/// Feed d'accueil (wireframe, comme Instagram) : posts des comptes suivis et les miens, repère « Vous êtes
/// à jour » après les 3 derniers jours, puis les publications plus anciennes à la demande. Jamais de
/// Liquid Glass sur le contenu (ADR-010).
struct FeedView: View {
    @State private var viewModel: FeedViewModel
    /// Incrémenté à chaque post supprimé ailleurs (détail, profil) : le feed se recharge.
    let deletedPostCount: Int
    /// Incrémenté à chaque post publié : le feed se recharge et remonte en haut, sur le nouveau post.
    let publishedCount: Int
    /// Feed vide : ouvre l'onglet Recherche.
    let onSearch: () -> Void

    @State private var position = ScrollPosition(edge: .top)
    @State private var postToDelete: Post?

    init(viewModel: FeedViewModel, deletedPostCount: Int, publishedCount: Int, onSearch: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.deletedPostCount = deletedPostCount
        self.publishedCount = publishedCount
        self.onSearch = onSearch
    }

    var body: some View {
        content
            .task(id: deletedPostCount) { await viewModel.appear(revision: deletedPostCount) }
            .onChange(of: publishedCount) {
                Task {
                    await viewModel.refresh()
                    withAnimation { position.scrollTo(edge: .top) }
                }
            }
            .alert(
                "Supprimer la publication ?",
                isPresented: Binding(
                    get: { postToDelete != nil },
                    set: {
                        if !$0 {
                            postToDelete = nil
                        }
                    }
                ),
                presenting: postToDelete
            ) { post in
                Button("Supprimer", role: .destructive) {
                    Task { await viewModel.delete(post) }
                }
                Button("Annuler", role: .cancel) {}
            } message: { _ in
                Text("Cette publication sera définitivement supprimée.")
            }
            .alert(
                "Suppression impossible",
                isPresented: Binding(
                    get: { viewModel.deleteErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.deleteErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.deleteErrorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading where viewModel.posts.isEmpty:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(message):
            ContentUnavailableView {
                Label("Feed indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        default:
            feed
        }
    }

    private var feed: some View {
        ScrollView {
            if viewModel.posts.isEmpty {
                emptyFeed
                    .containerRelativeFrame(.vertical)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.recentPosts) { post in
                        cell(post)
                    }
                    if viewModel.isCaughtUp {
                        caughtUp
                    }
                    if viewModel.isShowingOlder {
                        ForEach(viewModel.olderPosts) { post in
                            cell(post)
                        }
                    }
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .padding()
                    }
                }
            }
        }
        .scrollPosition($position)
        .refreshable { await viewModel.refresh() }
        .safeAreaInset(edge: .bottom) {
            if viewModel.loadMoreFailed {
                Button("Charger la suite") { Task { await viewModel.loadMore() } }
                    .buttonStyle(.bordered)
                    .padding()
            }
        }
    }

    private func cell(_ post: Post) -> some View {
        PostView(
            post: post,
            isDeleting: viewModel.deletingPostId == post.id,
            onDelete: viewModel.canDelete(post) ? { postToDelete = post } : nil,
            collapsesCaption: true
        )
        .task { await viewModel.postAppeared(post) }
    }

    /// Repère d'Instagram après les nouvelles publications ; les plus anciennes restent accessibles.
    private var caughtUp: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle")
                .font(.largeTitle)
                .accessibilityHidden(true)
            Text("Vous êtes à jour")
                .font(.headline)
            Text("Vous avez vu toutes les nouvelles publications des 3 derniers jours.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if viewModel.canShowOlder {
                Button("Afficher les publications plus anciennes") {
                    Task { await viewModel.showOlder() }
                }
                .font(.subheadline.weight(.semibold))
                .padding(.top, 4)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .top) { Divider() }
        .overlay(alignment: .bottom) {
            if viewModel.isShowingOlder {
                Divider()
            }
        }
    }

    /// Aucun post : comme Instagram, invitation à suivre des comptes.
    private var emptyFeed: some View {
        ContentUnavailableView {
            Label("Bienvenue", systemImage: "person.2")
        } description: {
            Text("Quand vous suivez des comptes, les photos qu'ils publient apparaissent ici.")
        } actions: {
            Button("Rechercher des comptes", action: onSearch)
        }
    }
}

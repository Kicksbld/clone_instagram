import SwiftUI

/// Pager vertical plein écran ; seul l'élément sélectionné reçoit un lecteur du pool de Core/Media.
/// Sous-onglets « Reels » et « Amis » (ADR-029) ; dans « Amis », les amis qui ont interagi ouvrent une
/// feuille dont chaque ligne mène au profil (destination fournie par `App`).
struct ReelsView: View {
    @State private var viewModel: ReelsViewModel
    let revision: Int
    let isActive: Bool
    let profileDestination: (ProfileRoute) -> AnyView
    @State private var selectedId: String?
    @State private var friendsSheet: FriendsSheet?
    @Environment(\.blockedUserIds) private var blockedIds
    @Environment(\.openComments) private var openComments
    @Environment(\.openSharePost) private var openSharePost

    init(
        viewModel: ReelsViewModel,
        revision: Int,
        isActive: Bool,
        profileDestination: @escaping (ProfileRoute) -> AnyView = { _ in AnyView(EmptyView()) }
    ) {
        _viewModel = State(initialValue: viewModel)
        self.revision = revision
        self.isActive = isActive
        self.profileDestination = profileDestination
    }

    private struct FriendsSheet: Identifiable {
        let id: String
    }

    private var visiblePosts: [Post] {
        viewModel.posts.filter { !blockedIds.contains($0.author.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Sous-onglet", selection: Binding(
                get: { viewModel.tab },
                set: { tab in Task { await viewModel.select(tab) } }
            )) {
                Text("Reels").tag(ReelsViewModel.Tab.reels)
                Text("Amis").tag(ReelsViewModel.Tab.friends)
            }
            .pickerStyle(.segmented)
            .padding()
            content
        }
        .sheet(item: $friendsSheet) { sheet in
            FriendInteractionsView(
                viewModel: viewModel.friendInteractions(of: sheet.id),
                profileDestination: profileDestination
            )
            .presentationDetents([.medium, .large])
        }
        .task(id: revision) { await viewModel.appear(revision: revision) }
        .onChange(of: selectedId) { _, id in
            // Un autre swipe ne doit pas annuler la page déjà demandée.
            Task { await viewModel.selected(id) }
        }
        .onChange(of: visiblePosts.map(\.id), initial: true) { _, ids in
            if selectedId == nil || !ids.contains(selectedId ?? "") {
                selectedId = ids.first
            }
        }
        .alert("Action impossible", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: {
                if !$0 {
                    viewModel.errorMessage = nil
                }
            }
        )) { Button("OK", role: .cancel) {} } message: { Text(viewModel.errorMessage ?? "") }
    }

    @ViewBuilder private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed:
            ContentUnavailableView {
                Label("Reels indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text("Impossible de charger les reels. Vérifiez votre connexion et réessayez.")
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        case .loaded where visiblePosts.isEmpty:
            ContentUnavailableView {
                Label("Aucun reel", systemImage: viewModel.tab == .friends ? "person.2" : "play.rectangle")
            } description: {
                Text(viewModel.tab == .friends
                    ? "Les reels que vos amis publient, aiment ou commentent apparaîtront ici."
                    : "Les reels des comptes publics et des comptes suivis apparaîtront ici.")
            } actions: {
                Button("Actualiser") { Task { await viewModel.load() } }
            }
        case .loaded:
            pager
        }
    }

    private var pager: some View {
        GeometryReader { geometry in
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(visiblePosts) { post in
                        reel(viewModel.displayed(post), nextURL: nextURL(after: post))
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipped()
                            .id(post.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollIndicators(.hidden)
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $selectedId)
            .overlay(alignment: .bottom) {
                if viewModel.loadMoreFailed {
                    Button("Charger la suite — Réessayer") { Task { await viewModel.loadMore() } }
                        .buttonStyle(.borderedProminent)
                        .padding(.bottom, 8)
                }
            }
        }
    }

    private func nextURL(after post: Post) -> URL? {
        guard let index = visiblePosts.firstIndex(where: { $0.id == post.id }),
              index + 1 < visiblePosts.count else { return nil }
        return visiblePosts[index + 1].cover?.hls
    }

    /// Onglet Amis : jusqu'à 3 photos d'amis et la phrase ; un appui ouvre la feuille des amis.
    @ViewBuilder private func friendsSummary(_ post: Post) -> some View {
        if let summary = post.friendsSummary(hiding: blockedIds) {
            Button {
                friendsSheet = FriendsSheet(id: post.id)
            } label: {
                HStack(spacing: 6) {
                    HStack(spacing: -8) {
                        ForEach(post.friendInteractions.filter { !blockedIds.contains($0.user.id) }) {
                            AvatarView(avatar: $0.user.avatar, size: 24)
                        }
                    }
                    Text(summary).font(.footnote)
                }
            }
            .accessibilityHint("Affiche les amis qui ont interagi avec ce reel")
        }
    }

    private func reel(_ post: Post, nextURL: URL?) -> some View {
        ZStack(alignment: .bottom) {
            if let media = post.cover {
                ReelPlayerView(
                    media: media,
                    isActive: isActive && friendsSheet == nil && selectedId == post.id,
                    showsCloseButton: false,
                    nextURL: nextURL
                )
            }
            HStack(alignment: .bottom) {
                VStack(alignment: .leading) {
                    friendsSummary(post)
                    Text(post.author.username).bold()
                    Text(MentionText.attributed(post.caption, mentions: post.mentions, blockedIds: blockedIds)).lineLimit(3)
                }
                Spacer()
                VStack(spacing: 16) {
                    Button {
                        Task { await viewModel.toggleLike(post) }
                    } label: {
                        Label("\(post.likeCount) J’aime", systemImage: post.isLiked ? "heart.fill" : "heart")
                    }
                    Button {
                        openComments?(CommentsRoute(postId: post.id, commentCount: post.commentCount))
                    } label: {
                        Label("\(post.commentCount) commentaires", systemImage: "bubble.right")
                    }
                    .disabled(openComments == nil)
                    Button("Partager", systemImage: "paperplane") {
                        openSharePost?(SharePostRoute(postId: post.id))
                    }
                    .disabled(openSharePost == nil)
                }
            }
            .padding()
            .foregroundStyle(.white)
            .background(.black.opacity(0.55))
        }
    }
}

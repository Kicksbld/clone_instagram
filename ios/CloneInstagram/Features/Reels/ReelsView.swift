import SwiftUI

/// Pager vertical plein écran ; seul l'élément sélectionné reçoit un lecteur du pool de Core/Media.
struct ReelsView: View {
    @State private var viewModel: ReelsViewModel
    let revision: Int
    let isActive: Bool
    @State private var selectedId: String?
    @Environment(\.blockedUserIds) private var blockedIds
    @Environment(\.openComments) private var openComments
    @Environment(\.openSharePost) private var openSharePost

    init(viewModel: ReelsViewModel, revision: Int, isActive: Bool) {
        _viewModel = State(initialValue: viewModel)
        self.revision = revision
        self.isActive = isActive
    }

    private var visiblePosts: [Post] {
        viewModel.posts.filter { !blockedIds.contains($0.author.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Reels").bold().accessibilityAddTraits(.isSelected)
                Button("Amis") {}.disabled(true)
            }
            .padding()
            content
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
                Label("Aucun reel", systemImage: "play.rectangle")
            } description: {
                Text("Les reels des comptes publics et des comptes suivis apparaîtront ici.")
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

    private func reel(_ post: Post, nextURL: URL?) -> some View {
        ZStack(alignment: .bottom) {
            if let media = post.cover {
                ReelPlayerView(
                    media: media,
                    isActive: isActive && selectedId == post.id,
                    showsCloseButton: false,
                    nextURL: nextURL
                )
            }
            HStack(alignment: .bottom) {
                VStack(alignment: .leading) {
                    Text(post.author.username).bold()
                    Text(post.caption).lineLimit(3)
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

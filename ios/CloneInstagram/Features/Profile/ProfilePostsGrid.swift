import NukeUI
import SwiftUI

/// Grille des publications d'un profil, comme Instagram : 3 colonnes, vignettes 3:4 recadrées au centre,
/// un toucher ouvre le post. Rechargée quand `reloadToken` change (post publié).
struct ProfilePostsGrid: View {
    @State private var viewModel: ProfilePostsViewModel
    var reloadToken = 0

    init(viewModel: ProfilePostsViewModel, reloadToken: Int = 0) {
        _viewModel = State(initialValue: viewModel)
        self.reloadToken = reloadToken
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 1), count: 3)

    var body: some View {
        content
            .task(id: reloadToken) { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading where viewModel.posts.isEmpty:
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding()
        case let .failed(message):
            ContentUnavailableView {
                Label("Publications indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        default:
            if viewModel.posts.isEmpty {
                ContentUnavailableView("Aucune publication", systemImage: "camera")
            } else {
                grid
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 1) {
            ForEach(viewModel.posts) { post in
                NavigationLink(value: PostRoute(postId: post.id)) {
                    PostThumbnail(media: post.cover)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(post.caption.isEmpty ? "Publication" : post.caption)
                .task {
                    if viewModel.shouldLoadMore(after: post) {
                        await viewModel.loadMore()
                    }
                }
            }
        }
        .overlay(alignment: .bottom) {
            if viewModel.isLoadingMore {
                ProgressView().padding()
            }
        }
        .safeAreaInset(edge: .bottom) {
            if viewModel.loadMoreFailed {
                Button("Charger la suite") { Task { await viewModel.loadMore() } }
                    .padding()
            }
        }
    }
}

/// Vignette 3:4 de la grille : image recadrée au centre, variante adaptée à la largeur (ADR-010).
private struct PostThumbnail: View {
    let media: PostMediaItem?
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Color.secondary.opacity(0.1)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .overlay {
                GeometryReader { proxy in
                    if let media {
                        LazyImage(url: media.variants.url(forPixelWidth: proxy.size.width * displayScale)) { state in
                            if let image = state.image {
                                image.resizable().scaledToFill()
                            }
                        }
                        .frame(width: proxy.size.width, height: proxy.size.height)
                    }
                }
            }
            .clipped()
    }
}

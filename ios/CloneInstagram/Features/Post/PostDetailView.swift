import NukeUI
import SwiftUI

/// Détail d'un post (wireframe, comme Instagram) : auteur, photo à son ratio, actions, légende et date.
/// Les actions (J'aime, Commenter, Partager, Enregistrer) arrivent en T8 et T9 : désactivées d'ici là.
struct PostDetailView: View {
    @State private var viewModel: PostDetailViewModel

    init(viewModel: PostDetailViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Publications")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
        case let .loaded(post):
            ScrollView {
                PostView(post: post)
            }
            .refreshable { await viewModel.load() }
        case .notFound:
            ContentUnavailableView(
                "Cette publication n'est pas disponible",
                systemImage: "photo.badge.exclamationmark",
                description: Text("Le lien est peut-être rompu, ou la publication a été supprimée.")
            )
        case let .failed(message):
            ContentUnavailableView {
                Label("Publication indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }
}

private struct PostView: View {
    let post: Post
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(value: ProfileRoute(username: post.author.username)) {
                HStack(spacing: 8) {
                    AvatarView(avatar: post.author.avatar, size: 32)
                    Text(post.author.username)
                        .font(.subheadline.weight(.semibold))
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal)

            if let media = post.cover {
                photo(media)
            }

            actions
                .padding(.horizontal)

            VStack(alignment: .leading, spacing: 4) {
                if !post.caption.isEmpty {
                    Text("\(Text(post.author.username).fontWeight(.semibold)) \(post.caption)")
                        .font(.subheadline)
                }
                Text(post.createdAt, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 8)
    }

    /// Photo pleine largeur à son ratio ; jamais de Liquid Glass sur le contenu (ADR-010).
    private func photo(_ media: PostMediaItem) -> some View {
        Color.secondary.opacity(0.1)
            .aspectRatio(media.aspectRatio, contentMode: .fit)
            .overlay {
                GeometryReader { proxy in
                    LazyImage(url: media.variants.url(forPixelWidth: proxy.size.width * displayScale)) { state in
                        if let image = state.image {
                            image.resizable().scaledToFill()
                        }
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
            .clipped()
            .accessibilityLabel(post.caption.isEmpty ? "Photo" : post.caption)
    }

    /// Provisoire : J'aime (T8), Commenter (T9), Partager et Enregistrer (plus tard).
    private var actions: some View {
        HStack(spacing: 16) {
            Button("J'aime", systemImage: "heart") {}
            Button("Commenter", systemImage: "bubble.right") {}
            Button("Partager", systemImage: "paperplane") {}
            Spacer()
            Button("Enregistrer", systemImage: "bookmark") {}
        }
        .labelStyle(.iconOnly)
        .font(.title3)
        .disabled(true)
    }
}

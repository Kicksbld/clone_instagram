import NukeUI
import SwiftUI

/// Détail d'un post (wireframe, comme Instagram) : auteur et menu « … », photos (carrousel) au ratio de la
/// première, actions, légende et date. Les actions (J'aime, Commenter, Partager, Enregistrer) arrivent en T8
/// et T9 : désactivées d'ici là.
struct PostDetailView: View {
    @State private var viewModel: PostDetailViewModel
    @State private var isConfirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(viewModel: PostDetailViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Publications")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            .alert("Supprimer la publication ?", isPresented: $isConfirmingDelete) {
                Button("Supprimer", role: .destructive) {
                    Task {
                        if await viewModel.delete() {
                            dismiss()
                        }
                    }
                }
                Button("Annuler", role: .cancel) {}
            } message: {
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
        case .loading:
            ProgressView()
        case let .loaded(post):
            ScrollView {
                PostView(
                    post: post,
                    isDeleting: viewModel.isDeleting,
                    onDelete: viewModel.canDelete ? { isConfirmingDelete = true } : nil
                )
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
    let isDeleting: Bool
    /// Menu « … » → « Supprimer » ; `nil` si le post n'est pas à moi.
    let onDelete: (() -> Void)?
    /// Photo affichée du carrousel.
    @State private var page = 0
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                NavigationLink(value: ProfileRoute(username: post.author.username)) {
                    HStack(spacing: 8) {
                        AvatarView(avatar: post.author.avatar, size: 32)
                        Text(post.author.username)
                            .font(.subheadline.weight(.semibold))
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                if let onDelete {
                    if isDeleting {
                        ProgressView()
                    } else {
                        Menu("Plus d'options", systemImage: "ellipsis") {
                            Button("Supprimer", systemImage: "trash", role: .destructive, action: onDelete)
                        }
                        .labelStyle(.iconOnly)
                        .foregroundStyle(.primary)
                    }
                }
            }
            .padding(.horizontal)

            if let cover = post.cover {
                carousel(ratio: cover.aspectRatio)
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

    /**
     Photos pleine largeur au ratio de la première (toutes recadrées au même ratio à la publication),
     balayées une à une ; compteur « 1/3 » en haut à droite, comme Instagram. Jamais de Liquid Glass sur
     le contenu (ADR-010).
     */
    private func carousel(ratio: Double) -> some View {
        TabView(selection: $page) {
            ForEach(Array(post.media.enumerated()), id: \.offset) { index, media in
                photo(media, index: index)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .aspectRatio(ratio, contentMode: .fit)
        .overlay(alignment: .topTrailing) {
            if post.media.count > 1 {
                Text("\(page + 1)/\(post.media.count)")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.regularMaterial, in: .capsule)
                    .padding(12)
                    .accessibilityHidden(true)
            }
        }
    }

    private func photo(_ media: PostMediaItem, index: Int) -> some View {
        Color.secondary.opacity(0.1)
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
            .accessibilityElement()
            .accessibilityLabel(photoLabel(index))
    }

    private func photoLabel(_ index: Int) -> String {
        let label = post.caption.isEmpty ? "Photo" : post.caption
        return post.media.count > 1 ? "\(label), photo \(index + 1) sur \(post.media.count)" : label
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
        .overlay {
            if post.media.count > 1 {
                pageDots
            }
        }
    }

    /// Points de pagination du carrousel, centrés sous la photo (comme Instagram).
    private var pageDots: some View {
        HStack(spacing: 4) {
            ForEach(post.media.indices, id: \.self) { index in
                Circle()
                    .fill(index == page ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
                    .frame(width: 6, height: 6)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Photo \(page + 1) sur \(post.media.count)")
    }
}

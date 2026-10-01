import NukeUI
import SwiftUI

/// Un post comme dans le feed et le détail d'Instagram (wireframe) : en-tête (auteur, menu « … »), photos
/// (carrousel) au ratio de la première, actions, légende et date. Partagé par les features Feed et Post.
struct PostView: View {
    let post: Post
    let isDeleting: Bool
    /// Menu « … » → « Supprimer » ; `nil` si le post n'est pas à moi.
    let onDelete: (() -> Void)?
    /// Feed : légende sur 2 lignes, « plus » pour la déplier ; détail : légende entière.
    let collapsesCaption: Bool
    /// Photo affichée du carrousel.
    @State private var page = 0
    @State private var isCaptionExpanded = false
    @State private var captionHeights = CaptionHeights()

    init(post: Post, isDeleting: Bool, onDelete: (() -> Void)?, collapsesCaption: Bool = false) {
        self.post = post
        self.isDeleting = isDeleting
        self.onDelete = onDelete
        self.collapsesCaption = collapsesCaption
    }

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
                    caption
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

    /// Variante `large` (ADR-010) : la largeur de l'écran dépasse 640 px sur tous les iPhone, et le feed
    /// précharge exactement cette URL.
    private func photo(_ media: PostMediaItem, index: Int) -> some View {
        Color.secondary.opacity(0.1)
            .overlay {
                GeometryReader { proxy in
                    LazyImage(url: media.variants.large) { state in
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

    private var captionText: Text {
        Text("\(Text(post.author.username).fontWeight(.semibold)) \(post.caption)")
    }

    /// Légende repliée sur 2 lignes dans le feed ; « plus » seulement si elle est tronquée (hauteur de la
    /// légende entière, mesurée sans l'afficher, plus grande que celle de la légende repliée).
    @ViewBuilder
    private var caption: some View {
        if collapsesCaption, !isCaptionExpanded {
            VStack(alignment: .leading, spacing: 2) {
                captionText
                    .lineLimit(2)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { captionHeights.collapsed = $0 }
                    .background(alignment: .topLeading) {
                        captionText
                            .fixedSize(horizontal: false, vertical: true)
                            .hidden()
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { captionHeights.full = $0 }
                    }
                if captionHeights.isTruncated {
                    Button("plus") { isCaptionExpanded = true }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Afficher toute la légende")
                }
            }
            .font(.subheadline)
        } else {
            captionText
                .font(.subheadline)
        }
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

/// Hauteurs de la légende repliée et entière, pour savoir s'il faut proposer « plus ».
private struct CaptionHeights: Equatable {
    var collapsed: CGFloat = 0
    var full: CGFloat = 0

    var isTruncated: Bool {
        full > collapsed + 1
    }
}

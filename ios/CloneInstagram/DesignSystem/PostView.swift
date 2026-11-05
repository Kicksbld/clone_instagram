import NukeUI
import SwiftUI

/// Un post comme dans le feed et le détail d'Instagram (wireframe) : en-tête (auteur, menu « … »), photos
/// (carrousel) au ratio de la première, actions, mentions J'aime, légende, lien vers les commentaires et
/// date. Partagé par les features Feed et Post ; les commentaires s'ouvrent par `openComments`. Un reel se
/// lit sur place, son coupé, avec le pool d'`AVPlayer` de `Core/Media` (ADR-024) ; un appui l'ouvre en
/// plein écran.
struct PostView: View {
    let post: Post
    /// Menu « … » → « Modifier » (si `openEditPost` est fourni) et « Supprimer » ; `nil` si le post n'est pas à
    /// moi (« Signaler » et « Bloquer » à la place).
    let onDelete: (() -> Void)?
    /// Bouton J'aime : like ou unlike.
    let onToggleLike: () -> Void
    /// Double tap sur la photo : like seulement.
    let onDoubleTapLike: () -> Void
    /// Feed : légende sur 2 lignes, « plus » pour la déplier ; détail : légende entière.
    let collapsesCaption: Bool
    /// Reel : lecture sur place (le feed ne l'accorde qu'au seul reel visible) ; sinon sa miniature.
    let playsReel: Bool
    /// Reel : la vidéo (pas la cellule entière) devient visible aux deux tiers ou cesse de l'être. Pas
    /// d'appel à la disparition de la vue : le plein écran ne doit pas céder la lecture à un autre reel.
    let onReelVisibilityChange: (Bool) -> Void
    /// Photo affichée du carrousel.
    @State private var page = 0
    @AccessibilityFocusState private var cardFocused: Bool
    @State private var isCaptionExpanded = false
    @State private var captionHeights = CaptionHeights()
    /// Incrémenté à chaque double tap : déclenche le cœur sur la photo.
    @State private var doubleTapCount = 0
    @State private var isShowingFullScreenReel = false
    @Environment(\.blockedUserIds) private var blockedUserIds
    @Environment(\.openSharePost) private var openSharePost
    @Environment(\.openComments) private var openComments
    @Environment(\.openEditPost) private var openEditPost
    @Environment(\.moderation) private var moderation
    @Environment(\.openURL) private var openURL

    init(
        post: Post,
        onDelete: (() -> Void)?,
        onToggleLike: @escaping () -> Void,
        onDoubleTapLike: @escaping () -> Void,
        collapsesCaption: Bool = false,
        playsReel: Bool = false,
        onReelVisibilityChange: @escaping (Bool) -> Void = { _ in }
    ) {
        self.post = post
        self.onDelete = onDelete
        self.onToggleLike = onToggleLike
        self.onDoubleTapLike = onDoubleTapLike
        self.collapsesCaption = collapsesCaption
        self.playsReel = playsReel
        self.onReelVisibilityChange = onReelVisibilityChange
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
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Publication de \(post.author.username)")
                .accessibilityHint("Ouvre le profil")
                .accessibilityAddTraits(.isHeader)
                Spacer()
                if onDelete != nil || moderation != nil {
                    Menu("Plus d'options", systemImage: "ellipsis") {
                        menuItems
                    }
                    .labelStyle(.iconOnly)
                    .foregroundStyle(.primary)
                }
            }
            .padding(.horizontal)

            if post.kind == .reel, let cover = post.cover {
                reel(cover)
            } else if let cover = post.cover {
                carousel(ratio: cover.aspectRatio)
            }

            actions
                .padding(.horizontal)

            VStack(alignment: .leading, spacing: 4) {
                if post.likeCount > 0 {
                    Text(likeCountText)
                        .font(.subheadline.weight(.semibold))
                }
                if !post.caption.isEmpty {
                    caption
                }
                if post.commentCount > 0, openComments != nil {
                    Button(commentCountText, action: showComments)
                        .buttonStyle(.plain)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text(post.createdAt, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 8)
        .onChange(of: isShowingFullScreenReel) {
            _, shown in if !shown {
                cardFocused = true
            }
        }
    }

    /// Raccourcis VoiceOver sur le média (balayage vers le haut ou le bas) ; les mêmes commandes restent
    /// atteignables une à une par balayage horizontal, sous le média.
    @ViewBuilder
    private var mediaActions: some View {
        Button(post.isLiked ? "Retirer la mention J’aime" : "J’aime", action: onToggleLike)
        if openComments != nil {
            Button("Commenter", action: showComments)
        }
        if let openSharePost {
            Button("Partager") { openSharePost(SharePostRoute(postId: post.id)) }
        }
        ForEach(post.mentions.filter { !blockedUserIds.contains($0.id) }, id: \.id) { mention in
            Button("Ouvrir le profil de \(mention.username)") {
                if let url = URL(string: "clone-mention://profile/\(mention.username)") {
                    openURL(url)
                }
            }
        }
        menuItems
    }

    /**
     Photos pleine largeur au ratio de la première (toutes recadrées au même ratio à la publication),
     balayées une à une ; compteur « 1/3 » en haut à droite, comme Instagram. Jamais de Liquid Glass sur
     le contenu (ADR-010).
     */
    private func carousel(ratio: Double) -> some View {
        TabView(selection: $page) {
            ForEach(Array(post.media.enumerated()), id: \.offset) { index, media in
                photo(media)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .aspectRatio(ratio, contentMode: .fit)
        .onTapGesture(count: 2) {
            doubleTapCount += 1
            onDoubleTapLike()
        }
        .overlay { DoubleTapHeart(trigger: doubleTapCount) }
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(post.media.indices.contains(page) ? photoLabel(page) : "Média indisponible")
        .accessibilityHint(post.media.count > 1 ? "Balayez vers le haut ou le bas pour changer de photo" : "")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment where page + 1 < post.media.count: page += 1
            case .decrement where page > 0: page -= 1
            default: break
            }
        }
        .accessibilityActions { mediaActions }
    }

    /**
     Reel au ratio de la vidéo, au plus 4:5 comme les photos (bandes noires au-delà), son coupé ; en pause
     pendant le plein écran, qui reprend le même lecteur du pool. Double tap : J'aime ; appui : plein écran.
     */
    private func reel(_ media: PostMediaItem) -> some View {
        ReelPlayerView(media: media, isActive: playsReel && !isShowingFullScreenReel, showsCloseButton: false)
            .aspectRatio(max(media.aspectRatio, 4.0 / 5.0), contentMode: .fit)
            .clipped()
            .onScrollVisibilityChange(threshold: 0.66, onReelVisibilityChange)
            .contentShape(.rect)
            .onTapGesture(count: 2) {
                doubleTapCount += 1
                onDoubleTapLike()
            }
            .onTapGesture { isShowingFullScreenReel = true }
            .overlay { DoubleTapHeart(trigger: doubleTapCount) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Reel. \(media.accessibilityDescription)")
            .accessibilityAddTraits(.startsMediaSession)
            .accessibilityAction { isShowingFullScreenReel = true }
            .accessibilityHint("Lit le reel en plein écran")
            .accessibilityActions { mediaActions }
            .accessibilityFocused($cardFocused)
            .fullScreenCover(isPresented: $isShowingFullScreenReel) {
                ReelPlayerView(media: media)
            }
    }

    /// Variante `large` (ADR-010) : la largeur de l'écran dépasse 640 px sur tous les iPhone, et le feed
    /// précharge exactement cette URL.
    private func photo(_ media: PostMediaItem) -> some View {
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
    }

    private var captionText: Text {
        Text(
            "\(Text(post.author.username).fontWeight(.semibold)) \(Text(MentionText.attributed(post.caption, mentions: post.mentions, blockedIds: blockedUserIds)))"
        )
    }

    /// Légende repliée sur 2 lignes dans le feed ; « plus » seulement si elle est tronquée (hauteur de la
    /// légende entière, mesurée sans l'afficher, plus grande que celle de la légende repliée).
    @ViewBuilder
    private var caption: some View {
        if collapsesCaption, !isCaptionExpanded {
            VStack(alignment: .leading, spacing: 2) {
                captionText
                    .lineLimit(2)
                    .accessibilityLabel(captionText)
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
        let label = post.media[index].accessibilityDescription
        return post.media.count > 1 ? "\(label), photo \(index + 1) sur \(post.media.count)" : label
    }

    /// « 1 mention J'aime », « 1 234 mentions J'aime », comme Instagram.
    private var likeCountText: String {
        let count = post.likeCount.formatted()
        return post.likeCount == 1 ? "\(count) mention J'aime" : "\(count) mentions J'aime"
    }

    /// « Afficher 1 commentaire », « Afficher les 12 commentaires », comme Instagram.
    private var commentCountText: String {
        post.commentCount == 1
            ? "Afficher 1 commentaire"
            : "Afficher les \(post.commentCount.formatted()) commentaires"
    }

    private func showComments() {
        openComments?(CommentsRoute(postId: post.id, commentCount: post.commentCount))
    }

    /// Actions du post.
    /// Mon post : « Modifier » et « Supprimer » ; celui d'un autre : « Signaler » et « Bloquer », comme Instagram.
    @ViewBuilder
    private var menuItems: some View {
        if let onDelete {
            if let openEditPost {
                Button("Modifier", systemImage: "pencil") {
                    openEditPost(EditPostRoute(postId: post.id, caption: post.caption, mediaAltTexts: post.media.map { $0.altText ?? "" }))
                }
            }
            Button("Supprimer", systemImage: "trash", role: .destructive, action: onDelete)
        } else if let moderation {
            let author = BlockRoute(userId: post.author.id, username: post.author.username)
            Button("Signaler", systemImage: "exclamationmark.bubble", role: .destructive) {
                moderation.report(ReportRoute(target: .post(id: post.id), author: author))
            }
            Button("Bloquer", systemImage: "hand.raised", role: .destructive) {
                moderation.block(author)
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 16) {
            LikeButton(isLiked: post.isLiked, action: onToggleLike)
            Button("Commenter", systemImage: "bubble.right", action: showComments)
                .foregroundStyle(.primary)
                .disabled(openComments == nil)
            Button("Partager", systemImage: "paperplane") {
                openSharePost?(SharePostRoute(postId: post.id))
            }
            .disabled(openSharePost == nil)
            Spacer()
            Button("Enregistrer", systemImage: "bookmark") {}
                .disabled(true)
                .accessibilityHidden(true)
        }
        .labelStyle(.iconOnly)
        .font(.title3)
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
        .accessibilityHidden(true)
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

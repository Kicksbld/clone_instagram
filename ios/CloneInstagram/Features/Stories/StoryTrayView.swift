import SwiftUI

/// Bandeau des stories en haut du feed (wireframe, comme Instagram) : « Votre story » d'abord, puis les
/// auteurs. Anneau plein pour une story non vue, fin pour une story vue, en pointillés pour une story
/// réservée aux amis proches (couleur à venir avec la tranche de style).
struct StoryTrayView: View {
    @State private var viewModel: StoryTrayViewModel
    /// Change à chaque rafraîchissement du feed : le bandeau se recharge aussi.
    let reloadToken: Int
    let makeViewer: (_ authors: [PostAuthor], _ startIndex: Int, _ deletions: StoryDeletionStore) -> StoryViewerViewModel
    let makeCreate: (_ onPublished: @escaping () -> Void) -> CreateStoryViewModel

    /// Suppressions de mes stories, partagées avec le viewer (ADR-020).
    @State private var deletions: StoryDeletionStore
    @State private var viewer: ViewerRoute?
    @State private var isCreating = false

    private struct ViewerRoute: Identifiable {
        let id = UUID()
        let authors: [PostAuthor]
        let startIndex: Int
    }

    init(
        viewModel: StoryTrayViewModel,
        deletions: StoryDeletionStore,
        reloadToken: Int,
        makeViewer: @escaping (
            _ authors: [PostAuthor],
            _ startIndex: Int,
            _ deletions: StoryDeletionStore
        ) -> StoryViewerViewModel,
        makeCreate: @escaping (_ onPublished: @escaping () -> Void) -> CreateStoryViewModel
    ) {
        _viewModel = State(initialValue: viewModel)
        _deletions = State(initialValue: deletions)
        self.reloadToken = reloadToken
        self.makeViewer = makeViewer
        self.makeCreate = makeCreate
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 14) {
                myStory
                ForEach(Array(viewModel.otherItems.enumerated()), id: \.element.id) { index, item in
                    Button {
                        open(viewModel.otherItems.map(\.author), at: index)
                    } label: {
                        bubble(item.author, title: item.author.username, item: item)
                    }
                    .buttonStyle(.plain)
                }
                if viewModel.state == .failed {
                    Button("Réessayer", systemImage: "arrow.clockwise") {
                        Task { await viewModel.load() }
                    }
                    .labelStyle(.iconOnly)
                    .frame(height: 70)
                    .accessibilityLabel("Recharger les stories")
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .task(id: reloadToken + deletions.revision) { await viewModel.load() }
        // Échec d'une suppression après la fermeture du viewer (ma dernière story) ; sinon le viewer l'affiche.
        .alert(
            "Action impossible",
            isPresented: Binding(
                get: { viewer == nil && deletions.errorMessage != nil },
                set: {
                    if !$0 {
                        deletions.errorMessage = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(deletions.errorMessage ?? "")
        }
        .fullScreenCover(
            item: $viewer,
            onDismiss: { Task { await viewModel.load() } },
            content: { route in
                StoryViewerView(viewModel: makeViewer(route.authors, route.startIndex, deletions))
            }
        )
        .fullScreenCover(isPresented: $isCreating) {
            CreateStoryView(viewModel: makeCreate { Task { await viewModel.load() } })
        }
    }

    /// « Votre story » : ouvre ma story active, ou la création ; le « + » ajoute toujours une story.
    private var myStory: some View {
        Button {
            if viewModel.myItem != nil {
                open([viewModel.currentUser], at: 0)
            } else {
                isCreating = true
            }
        } label: {
            bubble(viewModel.currentUser, title: "Votre story", item: viewModel.myItem)
                .overlay(alignment: .topTrailing) {
                    Button("Ajouter une story", systemImage: "plus.circle.fill") { isCreating = true }
                        .labelStyle(.iconOnly)
                        .font(.title3)
                        .background(Circle().fill(.background))
                        .offset(x: 2, y: 48)
                }
        }
        .buttonStyle(.plain)
    }

    private func bubble(_ author: PostAuthor, title: String, item: StoryTrayItem?) -> some View {
        VStack(spacing: 4) {
            AvatarView(avatar: author.avatar, size: 62)
                .padding(4)
                .overlay { ring(item) }
            Text(title)
                .font(.caption)
                .lineLimit(1)
                .frame(width: 72)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel(title, item))
    }

    @ViewBuilder
    private func ring(_ item: StoryTrayItem?) -> some View {
        if let item {
            Circle()
                .strokeBorder(
                    item.isSeen ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary),
                    style: StrokeStyle(lineWidth: item.isSeen ? 1 : 2.5, dash: item.hasCloseFriendsStory ? [5, 3] : [])
                )
        }
    }

    private func accessibilityLabel(_ title: String, _ item: StoryTrayItem?) -> String {
        guard let item else { return title }
        let audience = item.hasCloseFriendsStory ? ", amis proches" : ""
        return "\(title), story \(item.isSeen ? "vue" : "non vue")\(audience)"
    }

    private func open(_ authors: [PostAuthor], at index: Int) {
        viewer = ViewerRoute(authors: authors, startIndex: index)
    }
}

import NukeUI
import SwiftUI

/// Viewer plein écran (ADR-025) : barre de progression, 5 s par story, pause au doigt appuyé, appui à
/// gauche ou à droite pour revenir ou passer, glissement vers le bas pour fermer. La photo est entière dans
/// un cadre 9:16, sur un fond flouté de ses propres couleurs. Jamais de Liquid Glass sur le contenu.
struct StoryViewerView: View {
    @State private var viewModel: StoryViewerViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var dragOffset: CGFloat = 0
    @State private var isConfirmingDelete = false

    /// Pas de l'horloge du viewer.
    private static let tick = 0.05

    init(viewModel: StoryViewerViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
        }
        .offset(y: dragOffset)
        .gesture(
            DragGesture(minimumDistance: 20)
                .onChanged { dragOffset = max(0, $0.translation.height) }
                .onEnded { value in
                    if value.translation.height > 120 {
                        dismiss()
                    } else {
                        withAnimation { dragOffset = 0 }
                    }
                }
        )
        .task { await viewModel.start() }
        .task(id: viewModel.currentStory?.id) { await runClock() }
        .onChange(of: viewModel.state) { _, state in
            if state == .finished {
                dismiss()
            }
        }
        .onChange(of: isConfirmingDelete) { _, isConfirming in viewModel.isPaused = isConfirming }
        .confirmationDialog("Supprimer cette story ?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { Task { await viewModel.deleteCurrent() } }
            Button("Annuler", role: .cancel) {}
        }
        .alert(
            "Action impossible",
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
        .preferredColorScheme(.dark)
        .statusBarHidden()
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading, .finished:
            ProgressView()
        case let .failed(message):
            ContentUnavailableView {
                Label("Stories indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.start() } }
                Button("Fermer") { dismiss() }
            }
        case .showing:
            if let story = viewModel.currentStory {
                VStack(spacing: 8) {
                    canvas(story)
                        .overlay(alignment: .top) { header(story) }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// Cadre 9:16 : la photo entière sur un fond flouté de ses couleurs ; appui à gauche ou à droite,
    /// doigt appuyé pour mettre en pause.
    private func canvas(_ story: Story) -> some View {
        ZStack {
            LazyImage(url: story.photo.variants.thumb) { state in
                state.image?.resizable().scaledToFill().blur(radius: 40)
            }
            LazyImage(url: story.photo.variants.large) { state in
                if let image = state.image {
                    image.resizable().scaledToFit()
                        .task(id: story.id) { await viewModel.photoDidAppear(storyId: story.id) }
                } else {
                    ProgressView()
                }
            }
            .accessibilityLabel("Story de \(story.author.username)")
            GeometryReader { proxy in
                HStack(spacing: 0) {
                    // Comme Instagram : le tiers gauche revient en arrière, le reste passe.
                    tapArea("Story précédente") { await viewModel.previous() }
                        .frame(width: proxy.size.width / 3)
                    tapArea("Story suivante") { await viewModel.next() }
                }
            }
        }
        .aspectRatio(9 / 16, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func tapArea(_ label: String, action: @escaping () async -> Void) -> some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { Task { await action() } }
            .onLongPressGesture(minimumDuration: 0.2) {} onPressingChanged: { viewModel.isPaused = $0 }
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
    }

    private func header(_ story: Story) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 3) {
                ForEach(viewModel.stories.indices, id: \.self) { index in
                    ProgressView(value: barValue(index))
                        .progressViewStyle(.linear)
                }
            }
            .accessibilityHidden(true)
            HStack(spacing: 8) {
                AvatarView(avatar: story.author.avatar, size: 32)
                Text(story.author.username).font(.subheadline.weight(.semibold))
                Text(story.createdAt, format: .relative(presentation: .numeric, unitsStyle: .narrow))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if story.audience == .closeFriends {
                    Label("Amis proches", systemImage: "star.fill")
                        .labelStyle(.iconOnly)
                        .font(.caption)
                }
                Spacer()
                if viewModel.isMine {
                    Menu("Options", systemImage: "ellipsis") {
                        Button("Supprimer", systemImage: "trash", role: .destructive) { isConfirmingDelete = true }
                    }
                    .labelStyle(.iconOnly)
                }
                Button("Fermer", systemImage: "xmark") { dismiss() }
                    .labelStyle(.iconOnly)
            }
        }
        .padding(10)
        .background(LinearGradient(colors: [.black.opacity(0.4), .clear], startPoint: .top, endPoint: .bottom))
    }

    private func barValue(_ index: Int) -> Double {
        if index < viewModel.storyIndex {
            return 1
        }
        return index == viewModel.storyIndex ? viewModel.progress : 0
    }

    /// Horloge de la story affichée : s'arrête quand elle change ou que le viewer se ferme.
    private func runClock() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(Self.tick))
            if Task.isCancelled {
                return
            }
            await viewModel.advance(by: Self.tick)
        }
    }
}

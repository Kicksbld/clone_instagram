import NukeUI
import SwiftUI

/// Viewer plein écran (ADR-025) : barre de progression, 5 s par story, pause au doigt appuyé, appui à
/// gauche ou à droite pour revenir ou passer, glissement vers le bas pour fermer. La photo est entière dans
/// un cadre 9:16, sur un fond flouté de ses propres couleurs. Jamais de Liquid Glass sur le contenu.
struct StoryViewerView: View {
    @State private var viewModel: StoryViewerViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @AccessibilityFocusState private var photoFocused: Bool
    @State private var manuallyPaused = false
    @FocusState private var replyFocused: Bool
    @State private var dragOffset: CGFloat = 0
    @State private var isConfirmingDelete = false
    @State private var viewersStory: Story?
    @State private var editingStory: Story?
    @State private var isShowingPlus = false
    @AppStorage("anonymousStoryViews") private var anonymousPreference = false
    @Environment(\.plusPaywall) private var plusPaywall

    /// Pas de l'horloge du viewer.
    private static let tick = 0.05

    init(viewModel: StoryViewerViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        presentedViewer
            .alert("Vue non envoyée", isPresented: Binding(
                get: { viewModel.viewErrorMessage != nil && !isShowingPlus },
                set: {
                    if !$0 {
                        viewModel.viewErrorMessage = nil
                    }
                }
            )) {
                Button("Réessayer") { Task { await viewModel.retryView() } }
                Button("Fermer", role: .cancel) { viewModel.viewErrorMessage = nil }
            } message: { Text(viewModel.viewErrorMessage ?? "") }
            .preferredColorScheme(.dark)
            .statusBarHidden()
    }

    private var presentedViewer: some View {
        playback
            .alert(
                "Action impossible",
                isPresented: Binding(
                    get: { viewModel.deletions.errorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.deletions.errorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.deletions.errorMessage ?? "")
            }
            .sheet(item: $editingStory) { story in
                StoryDescriptionView(viewModel: viewModel.descriptionEditor(for: story))
            }
            .onChange(of: editingStory) { _, story in
                updatePause(hasViewers: viewersStory != nil)
                if story == nil {
                    photoFocused = true
                }
            }
            .sheet(item: $viewersStory) { story in
                StoryViewersView(
                    viewModel: StoryViewersViewModel(storyId: story.id, service: viewModel.viewersService),
                    isPlus: { viewModel.isPlus }
                )
            }
            .sheet(isPresented: $isShowingPlus) { plusPaywall() }
            .onChange(of: viewersStory) { _, value in updatePause(hasViewers: value != nil) }
            .onChange(of: isShowingPlus) { _, _ in updatePause(hasViewers: viewersStory != nil) }
            .onChange(of: viewModel.needsPlus) { _, needed in
                if needed {
                    isShowingPlus = true; viewModel.needsPlus = false
                }
            }
    }

    private var playback: some View {
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
        .task {
            viewModel.usesScreenReader = voiceOverEnabled
            if anonymousPreference {
                viewModel.restoreAnonymousPreference()
            }
            await viewModel.start()
        }
        .task(id: viewModel.currentStory?.id) {
            photoFocused = true
            await runClock()
        }
        .onChange(of: voiceOverEnabled) { _, enabled in viewModel.usesScreenReader = enabled }
        .accessibilityAction(.escape) { dismiss() }
        .accessibilityStatus(viewModel.replyError ?? "")
        .onChange(of: viewModel.isSendingReply) { wasSending, sending in
            if wasSending, !sending, viewModel.replyError == nil {
                AccessibilityFeedback.announce("Message envoyé")
            }
        }
        .onChange(of: viewModel.state) { _, state in
            if state == .finished {
                dismiss()
            }
        }
        .onChange(of: replyFocused) { _, focused in viewModel.isReplyFocused = focused }
        .onChange(of: viewModel.isReplyFocused) { _, focused in replyFocused = focused }
        .onChange(of: isConfirmingDelete) { _, _ in updatePause(hasViewers: viewersStory != nil) }
        .confirmationDialog("Supprimer cette story ?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { Task { await viewModel.deleteCurrent() } }
            Button("Annuler", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading, .finished:
            ProgressView().accessibilityLabel("Chargement en cours")
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
                    HStack {
                        Button("Story précédente", systemImage: "backward.end") { Task { await viewModel.previous() } }
                        Button(manuallyPaused ? "Reprendre" : "Pause", systemImage: manuallyPaused ? "play" : "pause") {
                            manuallyPaused.toggle()
                            updatePause(hasViewers: viewersStory != nil)
                        }
                        .accessibilityHint(voiceOverEnabled ? "Le passage à la story suivante reste manuel avec VoiceOver" : "")
                        Button("Story suivante", systemImage: "forward.end") { Task { await viewModel.next() } }
                    }
                    .labelStyle(.iconOnly)
                    if viewModel.isMine {
                        Button("Vues", systemImage: "eye") { viewersStory = story }
                    }
                    if viewModel.canReply {
                        HStack {
                            TextField("Envoyer un message", text: $viewModel.replyBody, axis: .vertical)
                                .focused($replyFocused)
                                .lineLimit(1 ... 3)
                                .disabled(viewModel.isSendingReply)
                            Button("Envoyer", systemImage: "paperplane") { Task { await viewModel.sendReply() } }
                                .labelStyle(.iconOnly)
                                .disabled(!viewModel.canSendReply)
                        }
                        .padding(.horizontal)
                        if let error = viewModel.replyError {
                            Text(error).font(.footnote)
                            Button("Réessayer") { Task { await viewModel.sendReply() } }
                                .disabled(!viewModel.canSendReply)
                        }
                    }
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
            .accessibilityHidden(true)
            LazyImage(url: story.photo.variants.large) { state in
                if let image = state.image {
                    image.resizable().scaledToFit()
                        .task(id: story.id) { await viewModel.photoDidAppear(storyId: story.id) }
                } else {
                    ProgressView().accessibilityLabel("Chargement en cours")
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "Story de \(story.author.username), \(viewModel.storyIndex + 1) sur \(viewModel.stories.count). \(story.photo.accessibilityDescription)"
            )
            .accessibilityFocused($photoFocused)
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
            .onLongPressGesture(minimumDuration: 0.2) {} onPressingChanged: { pressing in
                viewModel
                    .isPaused = pressing || manuallyPaused || viewersStory != nil || isShowingPlus || isConfirmingDelete || editingStory !=
                    nil
            }
            .accessibilityHidden(voiceOverEnabled)
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { Task { await action() } }
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
                if !viewModel.isMine {
                    Menu("Vue anonyme", systemImage: viewModel.anonymous ? "eye.slash.fill" : "eye") {
                        Toggle("Vue anonyme (Clone Plus)", isOn: Binding(
                            get: { viewModel.anonymous },
                            set: { enabled in
                                viewModel.setAnonymous(enabled)
                                if !enabled || viewModel.isPlus {
                                    anonymousPreference = enabled
                                }
                            }
                        ))
                        Text("S’applique aux prochaines vues. Une vue déjà envoyée reste visible.")
                    }.labelStyle(.iconOnly)
                }
                if viewModel.isMine {
                    Menu("Options", systemImage: "ellipsis") {
                        Button("Modifier la description", systemImage: "pencil") { editingStory = story }
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

    private func updatePause(hasViewers: Bool) {
        viewModel.isPaused = manuallyPaused || hasViewers || isShowingPlus || isConfirmingDelete || editingStory != nil
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

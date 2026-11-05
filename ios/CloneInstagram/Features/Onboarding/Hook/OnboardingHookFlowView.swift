import SwiftUI

/// Hook de l'onboarding (ADR-038) : barre du haut (retour, progression, son, « Passer »), puis un écran à la
/// fois avec une transition latérale.
struct OnboardingHookFlowView: View {
    @State private var viewModel: OnboardingHookViewModel
    /// Retour depuis le premier écran : écran de bienvenue.
    private let onExit: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(viewModel: OnboardingHookViewModel, onExit: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onExit = onExit
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ZStack {
                screen
                    .id(viewModel.step)
                    .transition(transition)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.45, bounce: 0.2), value: viewModel.step)
        .onboardingScreen()
        .onChange(of: viewModel.step, initial: true) { viewModel.screenViewed() }
    }

    private var isBackShown: Bool {
        viewModel.step == .intro || viewModel.canGoBack
    }

    private var transition: AnyTransition {
        guard !reduceMotion else { return .opacity }
        let edge: Edge = viewModel.isMovingForward ? .trailing : .leading
        return .asymmetric(
            insertion: .move(edge: edge).combined(with: .opacity),
            removal: .move(edge: edge == .trailing ? .leading : .trailing).combined(with: .opacity)
        )
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            Button("Retour", systemImage: "chevron.left") {
                if viewModel.step == .intro {
                    onExit()
                } else {
                    viewModel.back()
                }
            }
            .labelStyle(.iconOnly)
            .opacity(isBackShown ? 1 : 0)
            .disabled(!isBackShown)
            OnboardingProgressBar(progress: viewModel.progress)
            Button(
                viewModel.isMuted ? "Activer le son" : "Couper le son",
                systemImage: viewModel.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                action: viewModel.toggleMute
            )
            .labelStyle(.iconOnly)
            .contentTransition(.symbolEffect(.replace))
            if viewModel.canSkip {
                Button("Passer", action: viewModel.skip)
                    .buttonStyle(.onboardingSecondary)
            }
        }
        .font(.body.weight(.semibold))
        .foregroundStyle(.white)
        .frame(minHeight: 44)
        .padding(.horizontal)
    }

    @ViewBuilder
    private var screen: some View {
        switch viewModel.step {
        case .intro: HookIntroView(viewModel: viewModel)
        case .promise: HookPromiseView(viewModel: viewModel)
        case .quizInterests: HookInterestsQuizView(viewModel: viewModel)
        case .insightInterests: HookInsightView(text: viewModel.interestsInsight, action: viewModel.next)
        case .quizStyle: HookStyleQuizView(viewModel: viewModel)
        case .insightStyle: HookInsightView(text: viewModel.styleInsight, action: viewModel.next)
        case .quizRhythm: HookRhythmQuizView(viewModel: viewModel)
        case .likePost: HookLikePostView(viewModel: viewModel)
        case .firstPhoto: HookFirstPhotoView(viewModel: viewModel)
        case .celebration: HookCelebrationView(viewModel: viewModel)
        case .bridge: HookBridgeView(viewModel: viewModel)
        }
    }
}

/// Gabarit d'un écran du hook : contenu centré, bouton principal et bouton secondaire en bas.
struct HookScaffold<Content: View, Secondary: View>: View {
    let primaryTitle: String
    var isPrimaryEnabled = true
    let primaryAction: () -> Void
    @ViewBuilder let content: Content
    @ViewBuilder var secondary: Secondary

    var body: some View {
        VStack(spacing: 16) {
            ScrollView {
                VStack(spacing: 24) {
                    content
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
            VStack(spacing: 4) {
                Button(primaryTitle, action: primaryAction)
                    .buttonStyle(.onboardingPrimary)
                    .disabled(!isPrimaryEnabled)
                secondary
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
        }
    }
}

extension HookScaffold where Secondary == EmptyView {
    init(
        primaryTitle: String,
        isPrimaryEnabled: Bool = true,
        primaryAction: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.init(
            primaryTitle: primaryTitle,
            isPrimaryEnabled: isPrimaryEnabled,
            primaryAction: primaryAction,
            content: content,
            secondary: { EmptyView() }
        )
    }
}

/// Titre d'un écran du hook.
struct HookTitle: View {
    @AccessibilityFocusState private var titleFocused: Bool
    let text: String
    var subtitle: String?

    var body: some View {
        VStack(spacing: 8) {
            Text(text)
                .font(.onboardingTitle(.title))
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($titleFocused)
            if let subtitle {
                Text(subtitle)
                    .font(.onboardingBody())
                    .foregroundStyle(Color.onboardingSecondaryText)
            }
        }
        .multilineTextAlignment(.center)
        .task(id: text) { titleFocused = true }
        .frame(maxWidth: .infinity)
    }
}

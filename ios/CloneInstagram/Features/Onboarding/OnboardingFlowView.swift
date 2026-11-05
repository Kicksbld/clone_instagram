import SwiftUI

/// Parcours d'onboarding : hook pour un nouveau compte (ADR-038), puis une étape d'inscription par écran
/// dans une pile de navigation (fiche T2).
struct OnboardingFlowView: View {
    @State private var viewModel: OnboardingViewModel
    private let exitTitle: String
    private let onExit: () -> Void
    private let onProfileCreated: (String?) -> Void
    private let onInterestsChosen: ([OnboardingInterest]) -> Void
    private let onLogin: () -> Void

    init(
        viewModel: OnboardingViewModel,
        exitTitle: String,
        onProfileCreated: @escaping (String?) -> Void = { _ in },
        onInterestsChosen: @escaping ([OnboardingInterest]) -> Void = { _ in },
        onExit: @escaping () -> Void,
        onLogin: @escaping () -> Void
    ) {
        _viewModel = State(initialValue: viewModel)
        self.exitTitle = exitTitle
        self.onProfileCreated = onProfileCreated
        self.onInterestsChosen = onInterestsChosen
        self.onExit = onExit
        self.onLogin = onLogin
    }

    var body: some View {
        ZStack {
            if let hook = viewModel.hook, !viewModel.isHookDone {
                OnboardingHookFlowView(viewModel: hook, onExit: onExit)
                    .transition(.opacity)
            } else {
                registration
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.5, bounce: 0.2), value: viewModel.isHookDone)
        .onChange(of: viewModel.profile?.id, initial: true) { _, id in
            onProfileCreated(id)
        }
        .onChange(of: viewModel.hookResult.interests, initial: true) { _, interests in
            onInterestsChosen(interests)
        }
    }

    private var registration: some View {
        NavigationStack(path: $viewModel.path) {
            step(viewModel.rootStep)
                .toolbar {
                    // Sortie possible tant que le profil n'est pas créé.
                    if viewModel.profile == nil {
                        ToolbarItem(placement: .topBarLeading) {
                            Button(exitTitle, action: onExit)
                        }
                    }
                }
                .navigationDestination(for: OnboardingStep.self) { step($0) }
        }
        .tint(Color.cloneLime)
        .onChange(of: viewModel.currentStep, initial: true) { viewModel.screenViewed() }
    }

    @ViewBuilder
    private func step(_ step: OnboardingStep) -> some View {
        switch step {
        case .createAccount: CreateAccountStepView(viewModel: viewModel, onLogin: onLogin)
        case .email: EmailStepView(viewModel: viewModel)
        case .confirmationCode: ConfirmationCodeStepView(viewModel: viewModel)
        case .password: PasswordStepView(viewModel: viewModel)
        case .birthDate: BirthDateStepView(viewModel: viewModel)
        case .fullName: FullNameStepView(viewModel: viewModel)
        case .username: UsernameStepView(viewModel: viewModel)
        case .terms: TermsStepView(viewModel: viewModel)
        case .profilePhoto: ProfilePhotoStepView(viewModel: viewModel)
        case .bio: BioStepView(viewModel: viewModel)
        case .completed: CompletedStepView(viewModel: viewModel)
        }
    }
}

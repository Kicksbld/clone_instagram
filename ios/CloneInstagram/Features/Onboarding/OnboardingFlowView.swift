import SwiftUI

/// Parcours d'onboarding : une étape par écran dans une pile de navigation (fiche T2).
struct OnboardingFlowView: View {
    @State private var viewModel: OnboardingViewModel
    private let exitTitle: String
    private let onExit: () -> Void
    private let onLogin: () -> Void

    init(viewModel: OnboardingViewModel, exitTitle: String, onExit: @escaping () -> Void, onLogin: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.exitTitle = exitTitle
        self.onExit = onExit
        self.onLogin = onLogin
    }

    var body: some View {
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

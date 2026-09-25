import SwiftUI

/// Routeur racine (ADR-010) : chargement → bienvenue / connexion / onboarding / accueil.
struct RootView: View {
    let dependencies: AppDependencies
    @State private var viewModel: RootViewModel

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
        _viewModel = State(initialValue: RootViewModel(auth: dependencies.auth, identity: dependencies.identity))
    }

    var body: some View {
        content
            .task { await viewModel.start() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.route {
        case .loading:
            AppLogo()
        case .welcome:
            WelcomeView(onSignUp: viewModel.showSignUp, onLogin: viewModel.showLogin)
        case .login:
            LoginView(
                viewModel: LoginViewModel(auth: dependencies.auth) { await viewModel.start() },
                onBack: viewModel.showWelcome,
                onSignUp: viewModel.showSignUp
            )
        case let .onboarding(entry):
            OnboardingFlowView(
                viewModel: OnboardingViewModel(
                    entry: entry,
                    auth: dependencies.auth,
                    identity: dependencies.identity,
                    onFinished: viewModel.finishOnboarding(with:)
                ),
                exitTitle: entry == .newAccount ? "Annuler" : "Se déconnecter",
                onExit: {
                    if entry == .newAccount {
                        viewModel.showWelcome()
                    } else {
                        Task { await viewModel.signOut() }
                    }
                },
                onLogin: viewModel.showLogin
            )
            .id(entry)
        case let .home(profile):
            HomeView(profile: profile) {
                Task { await viewModel.signOut() }
            }
        case let .failed(message):
            ContentUnavailableView {
                Label("Connexion impossible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.start() } }
                Button("Se déconnecter") { Task { await viewModel.signOut() } }
            }
        }
    }
}

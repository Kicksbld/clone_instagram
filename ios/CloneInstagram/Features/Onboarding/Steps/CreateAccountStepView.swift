import SwiftUI

struct CreateAccountStepView: View {
    let viewModel: OnboardingViewModel
    let onLogin: () -> Void

    var body: some View {
        OnboardingStepLayout(
            title: "Créer un compte",
            subtitle: "Inscrivez-vous pour voir les photos et vidéos de vos amis.",
            primaryTitle: "S'inscrire avec une adresse e-mail",
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.startEmailSignUp
        ) {
            AppleSignInButton(label: .signUp) { credential in
                Task { await viewModel.signInWithApple(credential) }
            } onFailure: {
                viewModel.appleSignInFailed()
            }
        } secondary: {
            Button("J'ai déjà un compte", action: onLogin)
        }
    }
}

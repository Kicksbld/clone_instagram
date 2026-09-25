import SwiftUI

struct ConfirmationCodeStepView: View {
    @Bindable var viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Entrez le code de confirmation",
            subtitle: "Pour confirmer votre compte, saisissez le code à 6 chiffres envoyé à \(viewModel.email).",
            isPrimaryEnabled: viewModel.code.count == 6,
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitCode
        ) {
            TextField("Code de confirmation", text: $viewModel.code)
                .textFieldStyle(.roundedBorder)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
        } secondary: {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                Button("Renvoyer le code") {
                    Task { await viewModel.resendCode() }
                }
                .disabled(!viewModel.canResendCode || viewModel.isLoading)
            }
        }
    }
}

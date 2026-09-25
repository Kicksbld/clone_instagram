import SwiftUI

struct EmailStepView: View {
    @Bindable var viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Quelle est votre adresse e-mail ?",
            subtitle: "Saisissez l'adresse e-mail à laquelle on peut vous contacter. Personne ne la verra sur votre profil.",
            isPrimaryEnabled: !viewModel.email.isEmpty,
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitEmail
        ) {
            TextField("Adresse e-mail", text: $viewModel.email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await viewModel.submitEmail() } }
        }
    }
}

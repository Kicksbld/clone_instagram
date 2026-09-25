import SwiftUI

struct FullNameStepView: View {
    @Bindable var viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Quel est votre nom ?",
            subtitle: "Votre nom apparaît sur votre profil.",
            isPrimaryEnabled: !viewModel.fullName.trimmingCharacters(in: .whitespaces).isEmpty,
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitFullName
        ) {
            TextField("Nom complet", text: $viewModel.fullName)
                .textFieldStyle(.roundedBorder)
                .textContentType(.name)
                .onChange(of: viewModel.fullName) { _, value in
                    if value.count > OnboardingViewModel.fullNameMaxLength {
                        viewModel.fullName = String(value.prefix(OnboardingViewModel.fullNameMaxLength))
                    }
                }
        }
    }
}

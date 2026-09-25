import SwiftUI

struct BioStepView: View {
    @Bindable var viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Ajoutez une bio",
            subtitle: "Présentez-vous en quelques mots. Votre bio est visible par tous.",
            isPrimaryEnabled: !viewModel.bio.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitBio
        ) {
            TextField("Bio", text: $viewModel.bio, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(3 ... 6)
                .onChange(of: viewModel.bio) { _, value in
                    if value.count > OnboardingViewModel.bioMaxLength {
                        viewModel.bio = String(value.prefix(OnboardingViewModel.bioMaxLength))
                    }
                }
            Text("\(viewModel.bio.count)/\(OnboardingViewModel.bioMaxLength)")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
        } secondary: {
            Button("Passer", action: viewModel.skipBio)
                .disabled(viewModel.isLoading)
        }
    }
}

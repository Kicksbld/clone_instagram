import SwiftUI

struct PasswordStepView: View {
    @Bindable var viewModel: OnboardingViewModel
    @State private var isPasswordVisible = false

    var body: some View {
        OnboardingStepLayout(
            title: "Créez un mot de passe",
            subtitle: """
            Créez un mot de passe d'au moins \(OnboardingViewModel.minimumPasswordLength) lettres ou chiffres. \
            Il doit être difficile à deviner.
            """,
            isPrimaryEnabled: !viewModel.password.isEmpty,
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitPassword
        ) {
            HStack {
                Group {
                    if isPasswordVisible {
                        TextField("Mot de passe", text: $viewModel.password)
                    } else {
                        SecureField("Mot de passe", text: $viewModel.password)
                    }
                }
                .textContentType(.newPassword)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                Button(
                    isPasswordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe",
                    systemImage: isPasswordVisible ? "eye.slash" : "eye"
                ) {
                    isPasswordVisible.toggle()
                }
                .labelStyle(.iconOnly)
            }
            .textFieldStyle(.roundedBorder)
        }
        // Compte créé : pas de retour vers le code de confirmation.
        .navigationBarBackButtonHidden()
    }
}

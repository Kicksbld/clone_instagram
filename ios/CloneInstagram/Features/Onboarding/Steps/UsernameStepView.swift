import SwiftUI

struct UsernameStepView: View {
    let viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Créez un nom d'utilisateur",
            subtitle: "Ajoutez un nom d'utilisateur ou utilisez notre suggestion. Vous pourrez le modifier à tout moment.",
            isPrimaryEnabled: viewModel.usernameStatus == .available,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitUsername
        ) {
            TextField(
                "Nom d'utilisateur",
                text: Binding(get: { viewModel.username }, set: viewModel.usernameChanged)
            )
            .textFieldStyle(.roundedBorder)
            .textContentType(.username)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            status
        }
    }

    @ViewBuilder
    private var status: some View {
        switch viewModel.usernameStatus {
        case .idle:
            EmptyView()
        case .checking:
            ProgressView()
        case .available:
            Label("Ce nom d'utilisateur est disponible.", systemImage: "checkmark.circle")
                .font(.footnote)
        case .invalid:
            Label(
                "Seuls les lettres minuscules, chiffres, points et tirets bas sont autorisés (30 caractères au plus).",
                systemImage: "xmark.circle"
            )
            .font(.footnote)
        case let .taken(suggestions):
            VStack(alignment: .leading, spacing: 8) {
                Label("Le nom d'utilisateur \(viewModel.username) n'est pas disponible.", systemImage: "xmark.circle")
                    .font(.footnote)
                ForEach(suggestions, id: \.self) { suggestion in
                    Button(suggestion) { viewModel.chooseSuggestion(suggestion) }
                }
            }
        case .failed:
            Label("Vérification impossible. Vérifiez votre connexion.", systemImage: "wifi.exclamationmark")
                .font(.footnote)
        }
    }
}

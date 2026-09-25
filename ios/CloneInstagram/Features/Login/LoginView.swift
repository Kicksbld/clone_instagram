import SwiftUI

/// Connexion (« J'ai déjà un compte ») : email + mot de passe, ou Apple.
struct LoginView: View {
    @State private var viewModel: LoginViewModel
    private let onBack: () -> Void
    private let onSignUp: () -> Void

    init(viewModel: LoginViewModel, onBack: @escaping () -> Void, onSignUp: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onBack = onBack
        self.onSignUp = onSignUp
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                AppLogo()
                    .padding(.vertical)
                TextField("Adresse e-mail", text: $viewModel.email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Mot de passe", text: $viewModel.password)
                    .textContentType(.password)
                    .onSubmit { Task { await viewModel.signIn() } }
                if let errorMessage = viewModel.errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button {
                    Task { await viewModel.signIn() }
                } label: {
                    Group {
                        if viewModel.isLoading {
                            ProgressView()
                        } else {
                            Text("Se connecter")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .disabled(!viewModel.canSubmit)
                Text("ou")
                    .foregroundStyle(.secondary)
                AppleSignInButton(label: .signIn) { credential in
                    Task { await viewModel.signInWithApple(credential) }
                } onFailure: {
                    viewModel.appleSignInFailed()
                }
                Spacer()
                Button("Créer un compte", action: onSignUp)
            }
            .textFieldStyle(.roundedBorder)
            .padding()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Retour", systemImage: "chevron.backward", action: onBack)
                }
            }
        }
    }
}

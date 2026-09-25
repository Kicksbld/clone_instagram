import AuthenticationServices
import SwiftUI

/// Bouton Sign in with Apple système : renvoie le jeton et le nonce à échanger auprès de Supabase (ADR-018).
struct AppleSignInButton: View {
    let label: SignInWithAppleButton.Label
    let onCredential: (AppleCredential) -> Void
    let onFailure: () -> Void

    @State private var nonce = AppleSignInNonce.random()

    var body: some View {
        SignInWithAppleButton(label) { request in
            nonce = .random()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce.hashed
        } onCompletion: { result in
            switch result {
            case let .success(authorization):
                guard
                    let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                    let tokenData = credential.identityToken,
                    let idToken = String(data: tokenData, encoding: .utf8)
                else {
                    onFailure()
                    return
                }
                let name = credential.fullName
                    .map { PersonNameComponentsFormatter().string(from: $0) }
                    .flatMap { $0.isEmpty ? nil : $0 }
                onCredential(AppleCredential(idToken: idToken, nonce: nonce.raw, fullName: name))
            case let .failure(error):
                // Fenêtre fermée par l'utilisateur : pas une erreur à afficher.
                if (error as? ASAuthorizationError)?.code == .canceled {
                    return
                }
                onFailure()
            }
        }
        .frame(height: 50)
    }
}

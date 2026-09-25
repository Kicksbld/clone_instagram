import Foundation
import Observation

/// Connexion à un compte existant : email + mot de passe, ou Sign in with Apple (ADR-018).
@Observable
final class LoginViewModel {
    var email = ""
    var password = ""
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let auth: any AuthService
    private let onSignedIn: () async -> Void

    init(auth: any AuthService, onSignedIn: @escaping () async -> Void) {
        self.auth = auth
        self.onSignedIn = onSignedIn
    }

    var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !isLoading
    }

    func signIn() async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        await perform { () async throws(AuthServiceError) in
            try await self.auth.signIn(email: email, password: self.password)
        }
    }

    func signInWithApple(_ credential: AppleCredential) async {
        await perform { () async throws(AuthServiceError) in
            try await self.auth.signInWithApple(credential)
        }
    }

    func appleSignInFailed() {
        errorMessage = "La connexion avec Apple a échoué. Réessayez."
    }

    private func perform(_ action: () async throws(AuthServiceError) -> Void) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await action()
        } catch {
            errorMessage = Self.message(for: error)
            return
        }
        // Le routeur racine décide : accueil, ou reprise de l'onboarding si le profil manque.
        await onSignedIn()
    }

    private static func message(for error: AuthServiceError) -> String {
        switch error {
        case .invalidCredentials: "Adresse e-mail ou mot de passe incorrect."
        case .tooManyRequests: "Trop de tentatives. Patientez un peu avant de réessayer."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .invalidCode, .weakPassword, .invalidEmail, .unknown: "La connexion a échoué. Réessayez."
        }
    }
}

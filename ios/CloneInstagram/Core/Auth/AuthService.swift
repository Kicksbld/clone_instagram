import Foundation

/// Moyen de connexion du compte Supabase Auth.
enum AuthProvider: Hashable {
    case email
    case apple
}

/// Jeton Sign in with Apple prêt à être échangé contre une session Supabase (ADR-018).
struct AppleCredential: Equatable {
    let idToken: String
    /// Nonce en clair ; Apple a reçu son empreinte SHA-256.
    let nonce: String
    /// Nom fourni par Apple, uniquement à la première autorisation.
    let fullName: String?
}

enum AuthServiceError: Error, Equatable {
    /// Email ou mot de passe incorrect.
    case invalidCredentials
    /// Code de confirmation erroné ou expiré.
    case invalidCode
    /// Trop de demandes (renvoi du code trop rapproché, limite d'envoi d'emails).
    case tooManyRequests
    case weakPassword
    case invalidEmail
    /// Supabase Auth injoignable.
    case unreachable
    case unknown
}

/// Connexion Supabase Auth (ADR-004, ADR-018). Les jetons restent dans le Keychain (SDK `Auth`).
protocol AuthService: Sendable {
    /// Moyen de connexion de la session enregistrée, `nil` sans session.
    var currentProvider: AuthProvider? { get }
    /// Access token valide (rafraîchi si besoin), `nil` sans session.
    func accessToken() async -> String?
    /// Crée le compte si besoin et envoie un code à 6 chiffres par email.
    func sendSignupCode(to email: String) async throws(AuthServiceError)
    /// Vérifie le code et ouvre la session.
    func verifySignupCode(_ code: String, email: String) async throws(AuthServiceError)
    func setPassword(_ password: String) async throws(AuthServiceError)
    func signIn(email: String, password: String) async throws(AuthServiceError)
    func signInWithApple(_ credential: AppleCredential) async throws(AuthServiceError)
    func signOut() async
}

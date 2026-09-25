import Auth
import Foundation

/// `AuthService` sur le module `Auth` de `supabase-swift` (ADR-004) : session dans le Keychain.
final class SupabaseAuthService: AuthService {
    private let client: AuthClient

    init(configuration: SupabaseConfiguration) {
        client = AuthClient(
            url: configuration.url.appending(path: "auth/v1"),
            headers: ["apikey": configuration.publishableKey],
            localStorage: KeychainLocalStorage(),
            emitLocalSessionAsInitialSession: true
        )
    }

    var currentProvider: AuthProvider? {
        guard let session = client.currentSession else { return nil }
        guard case let .string(provider) = session.user.appMetadata["provider"] else { return .email }
        return provider == "apple" ? .apple : .email
    }

    func accessToken() async -> String? {
        try? await client.session.accessToken
    }

    func sendSignupCode(to email: String) async throws(AuthServiceError) {
        do {
            try await client.signInWithOTP(email: email, shouldCreateUser: true)
        } catch {
            throw Self.map(error)
        }
    }

    func verifySignupCode(_ code: String, email: String) async throws(AuthServiceError) {
        do {
            try await client.verifyOTP(email: email, token: code, type: .email)
        } catch {
            throw Self.map(error)
        }
    }

    func setPassword(_ password: String) async throws(AuthServiceError) {
        do {
            _ = try await client.update(user: UserAttributes(password: password))
        } catch {
            throw Self.map(error)
        }
    }

    func signIn(email: String, password: String) async throws(AuthServiceError) {
        do {
            _ = try await client.signIn(email: email, password: password)
        } catch {
            throw Self.map(error)
        }
    }

    func signInWithApple(_ credential: AppleCredential) async throws(AuthServiceError) {
        do {
            _ = try await client.signInWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: credential.idToken, nonce: credential.nonce)
            )
        } catch {
            throw Self.map(error)
        }
    }

    func signOut() async {
        // Session locale uniquement (cet appareil), même si Supabase est injoignable.
        try? await client.signOut(scope: .local)
    }

    private static func map(_ error: any Error) -> AuthServiceError {
        if error is URLError {
            return .unreachable
        }
        guard let authError = error as? AuthError else { return .unknown }
        switch authError.errorCode {
        case .otpExpired: return .invalidCode
        case .invalidCredentials: return .invalidCredentials
        case .weakPassword: return .weakPassword
        case .overEmailSendRateLimit, .overRequestRateLimit: return .tooManyRequests
        case .validationFailed: return .invalidEmail
        default: return .unknown
        }
    }
}

/// Utilisé quand la configuration Supabase est invalide : l'app affiche une erreur au lieu de planter.
struct UnavailableAuthService: AuthService {
    var currentProvider: AuthProvider? {
        nil
    }

    func accessToken() async -> String? {
        nil
    }

    func sendSignupCode(to _: String) async throws(AuthServiceError) {
        throw .unreachable
    }

    func verifySignupCode(_: String, email _: String) async throws(AuthServiceError) {
        throw .unreachable
    }

    func setPassword(_: String) async throws(AuthServiceError) {
        throw .unreachable
    }

    func signIn(email _: String, password _: String) async throws(AuthServiceError) {
        throw .unreachable
    }

    func signInWithApple(_: AppleCredential) async throws(AuthServiceError) {
        throw .unreachable
    }

    func signOut() async {}
}

@testable import CloneInstagram

/// Faux `AuthService` : erreurs programmables, appels enregistrés.
final class FakeAuthService: AuthService {
    var currentProvider: AuthProvider?
    var token: String? = "jeton"
    var sendCodeError: AuthServiceError?
    var verifyCodeError: AuthServiceError?
    var setPasswordError: AuthServiceError?
    var signInError: AuthServiceError?
    var appleError: AuthServiceError?
    private(set) var calls: [String] = []

    init(currentProvider: AuthProvider? = nil) {
        self.currentProvider = currentProvider
    }

    func accessToken() async -> String? {
        token
    }

    func sendSignupCode(to email: String) async throws(AuthServiceError) {
        calls.append("sendCode:\(email)")
        if let sendCodeError {
            throw sendCodeError
        }
    }

    func verifySignupCode(_ code: String, email: String) async throws(AuthServiceError) {
        calls.append("verifyCode:\(code):\(email)")
        if let verifyCodeError {
            throw verifyCodeError
        }
        currentProvider = .email
    }

    func setPassword(_ password: String) async throws(AuthServiceError) {
        calls.append("setPassword:\(password)")
        if let setPasswordError {
            throw setPasswordError
        }
    }

    func signIn(email: String, password _: String) async throws(AuthServiceError) {
        calls.append("signIn:\(email)")
        if let signInError {
            throw signInError
        }
        currentProvider = .email
    }

    func signInWithApple(_ credential: AppleCredential) async throws(AuthServiceError) {
        calls.append("apple:\(credential.idToken)")
        if let appleError {
            throw appleError
        }
        currentProvider = .apple
    }

    func signOut() async {
        calls.append("signOut")
        currentProvider = nil
    }
}

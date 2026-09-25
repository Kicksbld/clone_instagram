import Testing
@testable import CloneInstagram

struct LoginViewModelTests {
    private let auth = FakeAuthService()
    private let signedIn = SignedInCounter()

    private func makeViewModel() -> LoginViewModel {
        LoginViewModel(auth: auth) { [signedIn] in signedIn.calls += 1 }
    }

    @Test func `connexion réussie → routeur prévenu`() async {
        let viewModel = makeViewModel()
        viewModel.email = " Killian@Example.com "
        viewModel.password = "motdepasse"

        await viewModel.signIn()

        #expect(auth.calls == ["signIn:killian@example.com"])
        #expect(signedIn.calls == 1)
        #expect(viewModel.errorMessage == nil)
    }

    @Test func `identifiants incorrects → message, routeur non prévenu`() async {
        auth.signInError = .invalidCredentials
        let viewModel = makeViewModel()
        viewModel.email = "killian@example.com"
        viewModel.password = "faux"

        await viewModel.signIn()

        #expect(viewModel.errorMessage != nil)
        #expect(signedIn.calls == .zero)
    }

    @Test func `connexion Apple → routeur prévenu`() async {
        let viewModel = makeViewModel()

        await viewModel.signInWithApple(AppleCredential(idToken: "id", nonce: "n", fullName: nil))

        #expect(signedIn.calls == 1)
    }

    @Test func `bouton désactivé sans email ni mot de passe`() {
        #expect(!makeViewModel().canSubmit)
    }
}

final class SignedInCounter {
    var calls = 0
}

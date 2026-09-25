import Foundation
import Testing
@testable import CloneInstagram

/// Onboarding, partie compte : entrée, email, code, Apple, mot de passe, date de naissance, nom.
struct OnboardingViewModelTests {
    private let context = OnboardingTestContext()

    // MARK: - Entrée

    @Test(arguments: [
        (OnboardingEntry.newAccount, OnboardingStep.createAccount),
        (.resume(.email), .password),
        (.resume(.apple), .birthDate),
    ])
    func `première étape selon l'entrée`(entry: OnboardingEntry, step: OnboardingStep) {
        #expect(context.makeViewModel(entry: entry).currentStep == step)
    }

    // MARK: - Email et code

    @Test func `email invalide refusé sans appel`() async {
        let viewModel = context.makeViewModel()
        viewModel.startEmailSignUp()
        viewModel.email = "pas-un-email"

        await viewModel.submitEmail()

        #expect(viewModel.errorMessage != nil)
        #expect(context.auth.calls.isEmpty)
        #expect(viewModel.currentStep == .email)
    }

    @Test func `email valide → code envoyé, étape du code`() async {
        let viewModel = context.makeViewModel()
        viewModel.startEmailSignUp()
        viewModel.email = "  Killian@Example.com "

        await viewModel.submitEmail()

        #expect(context.auth.calls == ["sendCode:killian@example.com"])
        #expect(viewModel.path == [.email, .confirmationCode])
        #expect(!viewModel.canResendCode)
    }

    @Test func `envoi refusé (trop de demandes) → message, on reste sur l'étape`() async {
        context.auth.sendCodeError = .tooManyRequests
        let viewModel = context.makeViewModel()
        viewModel.startEmailSignUp()
        viewModel.email = "killian@example.com"

        await viewModel.submitEmail()

        #expect(viewModel.currentStep == .email)
        #expect(viewModel.errorMessage == OnboardingViewModel.message(for: .tooManyRequests))
    }

    @Test func `renvoi du code possible après 60 s`() async {
        let viewModel = context.makeViewModel()
        viewModel.email = "killian@example.com"
        await viewModel.submitEmail()

        await viewModel.resendCode()
        #expect(context.auth.calls.count == 1)

        context.clock.now += 60
        await viewModel.resendCode()
        #expect(context.auth.calls.count == 2)
    }

    @Test func `code erroné ou expiré → message`() async {
        context.auth.verifyCodeError = .invalidCode
        let viewModel = context.makeViewModel()
        viewModel.email = "killian@example.com"
        viewModel.code = "123456"

        await viewModel.submitCode()

        #expect(viewModel.errorMessage == OnboardingViewModel.message(for: .invalidCode))
        #expect(viewModel.path.isEmpty)
    }

    @Test func `code incomplet refusé sans appel`() async {
        let viewModel = context.makeViewModel()
        viewModel.code = "123"

        await viewModel.submitCode()

        #expect(viewModel.errorMessage != nil)
        #expect(context.auth.calls.isEmpty)
    }

    @Test func `code valide, nouveau compte → mot de passe`() async {
        let viewModel = context.makeViewModel()
        viewModel.email = "killian@example.com"
        viewModel.code = "123456"

        await viewModel.submitCode()

        #expect(context.auth.calls == ["verifyCode:123456:killian@example.com"])
        #expect(viewModel.currentStep == .password)
    }

    @Test func `code valide, compte déjà complet → accueil`() async {
        context.identity.meResults = [.success(.fixture())]
        let viewModel = context.makeViewModel()
        viewModel.email = "killian@example.com"
        viewModel.code = "123456"

        await viewModel.submitCode()

        #expect(context.finished.profiles == [.fixture()])
    }

    // MARK: - Apple

    @Test func `connexion Apple, nouveau compte → date de naissance, nom prérempli`() async {
        let viewModel = context.makeViewModel()

        await viewModel.signInWithApple(AppleCredential(idToken: "id", nonce: "n", fullName: "Killian B"))

        #expect(viewModel.currentStep == .birthDate)
        #expect(viewModel.fullName == "Killian B")
    }

    @Test func `connexion Apple, compte déjà complet → accueil`() async {
        context.identity.meResults = [.success(.fixture())]
        let viewModel = context.makeViewModel()

        await viewModel.signInWithApple(AppleCredential(idToken: "id", nonce: "n", fullName: nil))

        #expect(context.finished.profiles == [.fixture()])
    }

    // MARK: - Mot de passe, date de naissance, nom

    @Test func `mot de passe trop court refusé sans appel`() async {
        let viewModel = context.makeViewModel(entry: .resume(.email))
        viewModel.password = "12345"

        await viewModel.submitPassword()

        #expect(viewModel.errorMessage != nil)
        #expect(context.auth.calls.isEmpty)
    }

    @Test func `mot de passe enregistré → date de naissance`() async {
        let viewModel = context.makeViewModel(entry: .resume(.email))
        viewModel.password = "motdepasse"

        await viewModel.submitPassword()

        #expect(context.auth.calls == ["setPassword:motdepasse"])
        #expect(viewModel.currentStep == .birthDate)
    }

    @Test func `moins de 13 ans refusé`() throws {
        let viewModel = context.makeViewModel(entry: .resume(.apple))
        viewModel.birthDate = try context.date(2013, 9, 26)

        viewModel.submitBirthDate()

        #expect(viewModel.errorMessage != nil)
        #expect(viewModel.currentStep == .birthDate)
    }

    @Test func `treize ans le jour même : accepté`() throws {
        let viewModel = context.makeViewModel(entry: .resume(.apple))
        viewModel.birthDate = try context.date(2013, 9, 25)

        viewModel.submitBirthDate()

        #expect(viewModel.currentStep == .fullName)
    }

    @Test func `nom vide refusé`() async {
        let viewModel = context.makeViewModel(entry: .resume(.apple))
        viewModel.fullName = "   "

        await viewModel.submitFullName()

        #expect(viewModel.errorMessage != nil)
        #expect(viewModel.path.isEmpty)
    }
}
